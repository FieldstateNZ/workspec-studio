using System.ComponentModel;
using System.Diagnostics;
using System.Text;
using System.Text.Json;
using Aspire.Hosting.Workspec;

namespace Aspire.Hosting;

/// <summary>
/// Internal process-execution and diagnostics-formatting primitives shared by every workspec-c4
/// dashboard command and <see cref="WorkspecGraphSyncExtensions.WithGraphSync"/>. Purely internal —
/// never crosses the ATS export boundary — so it needs no <c>[AspireExport]</c> attribute; it's
/// exposed to <c>Aspire.Hosting.Workspec.Tests</c> via <c>InternalsVisibleTo</c> for direct unit
/// testing instead of only indirectly through the public dashboard-command surface.
/// </summary>
internal static class WorkspecC4CliRunner
{
    /// <summary>
    /// Upper bound on a single CLI run. The graph-sync subscriber runs during apphost startup
    /// (<c>AfterResourcesCreatedEvent</c> handlers are awaited sequentially, blocking startup), so a
    /// hung CLI without this bound would stall the whole apphost, not just its own feature.
    /// </summary>
    internal static readonly TimeSpan DefaultTimeout = TimeSpan.FromSeconds(60);

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

    /// <summary>Parses a workspec-c4 <c>--json</c> diagnostics-array stdout payload. Empty/blank input yields an empty list.</summary>
    public static IReadOnlyList<WorkspecCliDiagnostic> ParseDiagnostics(string stdout)
    {
        if (string.IsNullOrWhiteSpace(stdout))
        {
            return [];
        }

        return JsonSerializer.Deserialize<WorkspecCliDiagnostic[]>(stdout, DiagnosticsJsonOptions) ?? [];
    }

    /// <summary>Builds the Markdown result payload for the "Validate" dashboard command: a summary line plus a diagnostics table.</summary>
    public static string FormatValidateMarkdown(IReadOnlyList<WorkspecCliDiagnostic> diagnostics)
    {
        ArgumentNullException.ThrowIfNull(diagnostics);

        if (diagnostics.Count == 0)
        {
            return "No diagnostics — the `.workspec/` model is clean.";
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

    // Every cell is CLI-provided text; a literal '|' in any of them (not just Message) would break
    // the table row.
    private static string EscapeTableCell(string value) => value.Replace("|", "\\|", StringComparison.Ordinal);
}
