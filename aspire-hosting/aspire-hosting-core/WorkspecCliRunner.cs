using System.ComponentModel;
using System.Diagnostics;
using System.Text;
using System.Text.Json;

namespace Aspire.Hosting.Workspec;

/// <summary>
/// Shared process-execution and diagnostics-formatting primitives for every workspec module CLI
/// integration in this repo (workspec-c4, workspec-decisions, workspec-cost). Promoted here — A6,
/// <see href="https://github.com/FieldstateNZ/workspec-studio/issues/39">#39</see> — from three
/// byte-identical private copies (<c>WorkspecC4CliRunner</c>, <c>WorkspecDecisionsCliRunner</c>,
/// <c>WorkspecCostCliRunner</c>), each of which duplicated this exact process-execution shape
/// (redirect stdout/stderr, 60s default timeout, process-tree kill, degrade-not-throw on a missing
/// CLI). A plain static class, not a builder extension — it needs no <c>[AspireExport]</c>/
/// <c>[AspireExportIgnore]</c> attribute (the ATS analyzer only requires those on public extension
/// methods targeting <c>IDistributedApplicationBuilder</c>/<c>IResourceBuilder&lt;T&gt;</c>, which
/// this type has none of), the same as this project's own <see cref="WorkspecCliLocator"/> and
/// <see cref="WorkspecGraphDumper"/>.
/// </summary>
public static class WorkspecCliRunner
{
    /// <summary>
    /// Upper bound on a single CLI run. Some callers run during apphost startup (the graph-sync
    /// subscriber's <c>AfterResourcesCreatedEvent</c> handlers are awaited sequentially, blocking
    /// startup); others run on user demand from a dashboard command. Either way, a hung CLI without
    /// this bound would stall the caller indefinitely instead of degrading to a reported failure.
    /// </summary>
    public static readonly TimeSpan DefaultTimeout = TimeSpan.FromSeconds(60);

    private static readonly JsonSerializerOptions DiagnosticsJsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    /// <summary>
    /// Runs a resolved workspec CLI invocation with <paramref name="args"/> appended after
    /// <see cref="WorkspecCliInvocation.ArgsPrefix"/>, capturing stdout/stderr without deadlocking
    /// (both streams are read concurrently with waiting for exit, not sequentially). If the process
    /// can't even be started (the CLI binary is missing — a <see cref="Win32Exception"/>), this
    /// degrades to a synthesized failure tuple with exit code <c>-1</c> instead of throwing: a
    /// missing CLI must never fault a caller (a dashboard command, the graph-sync event subscriber),
    /// only report as a normal failed outcome. A run exceeding <paramref name="timeout"/> (default
    /// <see cref="DefaultTimeout"/>) has its whole process tree killed and degrades to the same
    /// <c>-1</c> failure shape — never a hang, never an exception. Caller-initiated cancellation
    /// (<paramref name="cancellationToken"/>) also kills the process tree, then rethrows
    /// <see cref="OperationCanceledException"/> as usual.
    /// </summary>
    public static async Task<(int ExitCode, string Stdout, string Stderr)> RunAsync(
        WorkspecCliInvocation invocation,
        IReadOnlyList<string> args,
        string workingDirectory,
        CancellationToken cancellationToken,
        TimeSpan? timeout = null)
    {
        ArgumentNullException.ThrowIfNull(invocation);
        ArgumentNullException.ThrowIfNull(args);
        ArgumentException.ThrowIfNullOrWhiteSpace(workingDirectory);

        var effectiveTimeout = timeout ?? DefaultTimeout;

        var startInfo = new ProcessStartInfo
        {
            FileName = invocation.Command,
            WorkingDirectory = workingDirectory,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
        };

        foreach (var prefixArg in invocation.ArgsPrefix)
        {
            startInfo.ArgumentList.Add(prefixArg);
        }

        foreach (var arg in args)
        {
            startInfo.ArgumentList.Add(arg);
        }

        using var process = new Process { StartInfo = startInfo };

        try
        {
            process.Start();
        }
        catch (Win32Exception ex)
        {
            return (-1, string.Empty, $"failed to start '{invocation.Command}': {ex.Message}");
        }

        var stdoutTask = process.StandardOutput.ReadToEndAsync(CancellationToken.None);
        var stderrTask = process.StandardError.ReadToEndAsync(CancellationToken.None);

        using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeoutCts.CancelAfter(effectiveTimeout);

        try
        {
            await process.WaitForExitAsync(timeoutCts.Token).ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
            KillProcessTree(process);

            // Reap the killed process and let the stream readers drain to EOF so nothing leaks.
            await process.WaitForExitAsync(CancellationToken.None).ConfigureAwait(false);
            await stdoutTask.ConfigureAwait(false);
            await stderrTask.ConfigureAwait(false);

            // Caller cancellation is a normal cancellation, not a degraded CLI outcome.
            cancellationToken.ThrowIfCancellationRequested();

            return (-1, string.Empty, $"'{invocation.Command}' timed out after {effectiveTimeout.TotalSeconds:F0}s and was killed.");
        }

        var stdout = await stdoutTask.ConfigureAwait(false);
        var stderr = await stderrTask.ConfigureAwait(false);

        return (process.ExitCode, stdout, stderr);
    }

    private static void KillProcessTree(Process process)
    {
        try
        {
            process.Kill(entireProcessTree: true);
        }
        catch (InvalidOperationException)
        {
            // Already exited between the timeout firing and the kill — nothing to do.
        }
        catch (Win32Exception)
        {
            // Exiting/inaccessible; the WaitForExitAsync reap below still observes its end.
        }
    }

    /// <summary>Parses a workspec module CLI's <c>--json</c> diagnostics-array stdout payload. Empty/blank input yields an empty list.</summary>
    public static IReadOnlyList<WorkspecCliDiagnostic> ParseDiagnostics(string stdout)
    {
        if (string.IsNullOrWhiteSpace(stdout))
        {
            return [];
        }

        return JsonSerializer.Deserialize<WorkspecCliDiagnostic[]>(stdout, DiagnosticsJsonOptions) ?? [];
    }

    /// <summary>
    /// Builds the Markdown result payload for a "Validate" dashboard command: a summary line plus a
    /// diagnostics table. <paramref name="cleanMessage"/> is the module-specific message shown when
    /// <paramref name="diagnostics"/> is empty (each module CLI integration owns its own wording,
    /// e.g. "the `.workspec/` model is clean" vs. "every decision/catalog artifact is valid").
    /// </summary>
    public static string FormatValidateMarkdown(IReadOnlyList<WorkspecCliDiagnostic> diagnostics, string cleanMessage)
    {
        ArgumentNullException.ThrowIfNull(diagnostics);
        ArgumentException.ThrowIfNullOrWhiteSpace(cleanMessage);

        if (diagnostics.Count == 0)
        {
            return cleanMessage;
        }

        var errorCount = diagnostics.Count(d => d.Severity == "error");
        var warningCount = diagnostics.Count - errorCount;

        var markdown = new StringBuilder();
        markdown.Append(errorCount).Append(" error(s), ").Append(warningCount).Append(" warning(s).\n\n");
        markdown.Append("| severity | code | file | message |\n");
        markdown.Append("| --- | --- | --- | --- |\n");

        foreach (var diagnostic in diagnostics)
        {
            markdown.Append("| ").Append(EscapeTableCell(diagnostic.Severity))
                .Append(" | ").Append(EscapeTableCell(diagnostic.Code))
                .Append(" | ").Append(EscapeTableCell(diagnostic.File))
                .Append(" | ").Append(EscapeTableCell(diagnostic.Message))
                .Append(" |\n");
        }

        return markdown.ToString();
    }

    /// <summary>
    /// Escapes a single Markdown table cell: every cell in a command result table is CLI-provided
    /// (or otherwise externally sourced) text, so it must never be assumed well-formed. A literal
    /// <c>|</c> would split the row into extra columns; a literal newline would split it into extra
    /// rows — both are escaped rather than left to corrupt the table. <see langword="null"/>/empty
    /// input is null-safe and renders as an empty cell (the original three private copies this was
    /// promoted from — A6, #39 — handled <c>|</c> but not newlines, and would throw a
    /// <see cref="NullReferenceException"/> on a null field; both are fixed here, once, for every
    /// caller).
    /// </summary>
    public static string EscapeTableCell(string? value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return string.Empty;
        }

        return value
            .Replace("|", "\\|", StringComparison.Ordinal)
            .Replace("\r\n", "<br>", StringComparison.Ordinal)
            .Replace("\r", "<br>", StringComparison.Ordinal)
            .Replace("\n", "<br>", StringComparison.Ordinal);
    }
}
