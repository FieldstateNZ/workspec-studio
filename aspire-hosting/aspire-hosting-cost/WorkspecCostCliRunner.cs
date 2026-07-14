using System.ComponentModel;
using System.Diagnostics;
using System.Text.Json;
using Aspire.Hosting.Workspec;

namespace Aspire.Hosting;

// TODO(A6, #39): consolidate with aspire-hosting-c4's WorkspecC4CliRunner into Core. Both are
// byte-for-byte the same process-execution shape (redirect stdout/stderr, 60s default timeout,
// process-tree kill, degrade-not-throw on a missing CLI) — kept as separate private copies for
// this slice per the A5 scope note, rather than risking a shared-abstraction change to
// aspire-hosting-c4 (reviewed, merged) in the same PR that adds this new module.
/// <summary>
/// Internal process-execution and diagnostics-formatting primitives for every workspec-cost
/// dashboard command. Purely internal — never crosses the ATS export boundary — so it needs no
/// <c>[AspireExport]</c> attribute; it's exposed to <c>Aspire.Hosting.Workspec.Tests</c> via
/// <c>InternalsVisibleTo</c> for direct unit testing instead of only indirectly through the public
/// dashboard-command surface.
/// </summary>
internal static class WorkspecCostCliRunner
{
    /// <summary>
    /// Upper bound on a single CLI run. Dashboard commands run on user demand (not during apphost
    /// startup), but a hung <c>workspec-cost</c> process — e.g. a stocktake stuck on a network call
    /// to Azure — must still resolve to a clean failure rather than hang the command forever.
    /// </summary>
    internal static readonly TimeSpan DefaultTimeout = TimeSpan.FromSeconds(60);

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    /// <summary>
    /// Runs a resolved workspec CLI invocation with <paramref name="args"/> appended after
    /// <see cref="WorkspecCliInvocation.ArgsPrefix"/>, capturing stdout/stderr without deadlocking
    /// (both streams are read concurrently with waiting for exit, not sequentially). If the process
    /// can't even be started (the CLI binary is missing — a <see cref="Win32Exception"/>), this
    /// degrades to a synthesized failure tuple with exit code <c>-1</c> instead of throwing: a
    /// missing CLI must never fault a dashboard command, only report as a normal failed outcome. A
    /// run exceeding <paramref name="timeout"/> (default <see cref="DefaultTimeout"/>) has its whole
    /// process tree killed and degrades to the same <c>-1</c> failure shape — never a hang, never an
    /// exception. Caller-initiated cancellation (<paramref name="cancellationToken"/>) also kills the
    /// process tree, then rethrows <see cref="OperationCanceledException"/> as usual.
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

    /// <summary>
    /// Parses a workspec-cost <c>validate --json</c> stdout payload: a diagnostics array, printed
    /// regardless of exit code (0 = all OK, possibly with warnings; 1 = at least one error).
    /// Empty/blank input yields an empty list.
    /// </summary>
    public static IReadOnlyList<WorkspecCostDiagnostic> ParseDiagnostics(string stdout)
    {
        if (string.IsNullOrWhiteSpace(stdout))
        {
            return [];
        }

        return JsonSerializer.Deserialize<WorkspecCostDiagnostic[]>(stdout, JsonOptions) ?? [];
    }

    /// <summary>Parses a workspec-cost <c>report --format json</c> stdout payload: <c>{ rollup, coverage, totals }</c>.</summary>
    public static WorkspecCostReportPayload ParseReportPayload(string stdout)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(stdout);

        return JsonSerializer.Deserialize<WorkspecCostReportPayload>(stdout, JsonOptions)
            ?? throw new JsonException("workspec-cost report --format json produced a null payload.");
    }
}
