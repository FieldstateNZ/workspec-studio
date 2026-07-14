using System.Collections.Immutable;
using Aspire.Hosting.ApplicationModel;
using Aspire.Hosting.Workspec;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Aspire.Hosting;

/// <summary>
/// Outcome of one <c>workspec-c4 import-aspire</c> invocation, shared by the <see cref="AfterResourcesCreatedEvent"/>
/// subscriber and the "Sync .workspec" dashboard command in <see cref="WorkspecGraphSyncExtensions.WithGraphSync"/>.
/// </summary>
/// <param name="CliMissing">The CLI process itself couldn't be started (see <see cref="WorkspecC4CliRunner.RunAsync"/>'s -1 exit code convention).</param>
/// <param name="ExitCode">The process exit code (or -1 for <paramref name="CliMissing"/>).</param>
/// <param name="Diagnostics">Parsed drift diagnostics (check mode only; always empty for scaffold mode).</param>
/// <param name="RawStderr">The process's raw stderr — scaffold mode's human-readable "wrote/changed N file(s)" lines, or a failure message.</param>
/// <param name="UnexpectedExit">
/// The process ran but returned an exit code outside its documented contract (e.g. usage error 2 in
/// check mode, or non-zero in scaffold mode). Treated like <paramref name="CliMissing"/> by callers —
/// distinguished here only so logging/tests can tell the two degraded cases apart.
/// </param>
internal sealed record WorkspecGraphSyncResult(
    bool CliMissing,
    int ExitCode,
    IReadOnlyList<WorkspecCliDiagnostic> Diagnostics,
    string RawStderr,
    bool UnexpectedExit = false);

/// <summary>Wires <c>workspec-c4 import-aspire</c> into an apphost: an on-run sync plus an on-demand dashboard command.</summary>
public static class WorkspecGraphSyncExtensions
{
    /// <summary>
    /// Keeps <c>.workspec/</c> in sync with the apphost's own resource graph via <c>workspec-c4 import-aspire</c>.
    /// </summary>
    /// <remarks>
    /// <para>
    /// On every <see cref="AfterResourcesCreatedEvent"/> in run mode, the current
    /// <see cref="DistributedApplicationModel"/> is dumped (via <see cref="WorkspecGraphDumper"/>) to a
    /// stable scratch path: <c>{AppHostDirectory}/obj/workspec-c4/{resourceName}.graph.json</c>. This
    /// exact path is an authoritative, documented convention — it lives under the consuming apphost
    /// project's own <c>obj/</c> directory, which standard .NET tooling already treats as disposable
    /// build output (this repo's own <c>aspire-hosting/.gitignore</c> already excludes
    /// <c>aspire-hosting/**/obj/</c>; a third-party apphost consuming this package from NuGet gets the
    /// same exclusion for free from the universal per-project <c>obj/</c> convention, with no action
    /// needed from this package).
    /// </para>
    /// <para>
    /// <paramref name="mode"/> controls what the on-run sync does: <see cref="WorkspecGraphSyncMode.Check"/>
    /// (the default) reports drift (and logs each diagnostic) without writing anything;
    /// <see cref="WorkspecGraphSyncMode.Scaffold"/> writes the tree. Regardless of
    /// <paramref name="mode"/>, the "Sync .workspec" dashboard command this method also registers
    /// always runs scaffold mode on demand. A missing CLI, or any other failure, is logged and
    /// degrades — this subscriber must never fault apphost startup for a diagnostic/sync
    /// side-effect, mirroring <c>WithWorkspecGraphDump</c>'s own crash-safety rule.
    /// </para>
    /// <para>
    /// Sync outcomes are published as a snapshot <b>property</b> (<c>workspec.sync</c> =
    /// <c>in-sync</c> / <c>drift(N)</c> / <c>unavailable</c>, visible in the dashboard's resource
    /// details pane), never as the resource's lifecycle <c>State</c>. Overriding <c>State</c> looks
    /// tempting but is a correctness bug: <c>CustomResourceSnapshot.ComputeHealthStatus</c> only
    /// computes aggregate health while <c>State == Running</c>, so any custom state text nulls the
    /// resource's health status, breaks <c>WaitForResourceHealthyAsync</c>/<c>WaitFor</c> gating on
    /// this resource, and masks the real Running/Exited lifecycle on the dashboard.
    /// </para>
    /// </remarks>
    /// <param name="builder">The workspec-c4 resource builder.</param>
    /// <param name="mode">Which mode the automatic on-run sync uses (default <see cref="WorkspecGraphSyncMode.Check"/>).</param>
    /// <returns>The resource builder, for chaining.</returns>
    [AspireExport]
    public static IResourceBuilder<WorkspecC4StudioResource> WithGraphSync(
        this IResourceBuilder<WorkspecC4StudioResource> builder,
        WorkspecGraphSyncMode mode = WorkspecGraphSyncMode.Check)
    {
        ArgumentNullException.ThrowIfNull(builder);

        var appHostDirectory = builder.ApplicationBuilder.AppHostDirectory;
        var apphostName = builder.ApplicationBuilder.Environment.ApplicationName;

        // AfterResourcesCreatedEvent is a global, not-per-resource lifecycle event — it does not
        // implement IDistributedApplicationResourceEvent, so the resource-scoped Subscribe<T>(IResource, ...)
        // overload does not accept it (confirmed by the compiler, not just by inspection). This uses
        // the same non-scoped Subscribe<T>(Func<...>) overload Core's WithWorkspecGraphDump uses;
        // builder.Resource is still captured in the closure below so the callback only ever acts on
        // this one workspec-c4 resource.
        builder.ApplicationBuilder.Eventing.Subscribe<AfterResourcesCreatedEvent>(async (@event, cancellationToken) =>
        {
            if (!builder.ApplicationBuilder.ExecutionContext.IsRunMode)
            {
                return;
            }

            try
            {
                var loggerService = @event.Services.GetRequiredService<ResourceLoggerService>();
                var logger = loggerService.GetLogger(builder.Resource);
                var notificationService = @event.Services.GetRequiredService<ResourceNotificationService>();

                var result = await RunImportAspireAsync(
                    builder.Resource,
                    @event.Model,
                    apphostName,
                    appHostDirectory,
                    mode,
                    cancellationToken).ConfigureAwait(false);

                await ApplySyncResultAsync(builder.Resource, result, mode, logger, notificationService).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                // An unhandled exception here propagates out of the event subscriber and faults
                // apphost startup after resources are already running — log and continue instead,
                // exactly like WithWorkspecGraphDump does for the same reason.
                @event.Services.GetService<ILoggerFactory>()
                    ?.CreateLogger(typeof(WorkspecGraphSyncExtensions))
                    .LogError(ex, "workspec-c4 graph sync failed unexpectedly for resource '{Resource}'; continuing without it.", builder.Resource.Name);
            }
        });

        return builder.WithCommand(
            "sync-workspec",
            "Sync .workspec",
            executeCommand: async context =>
            {
                var model = context.ServiceProvider.GetRequiredService<DistributedApplicationModel>();

                // The dashboard command always runs scaffold mode on demand, regardless of the
                // on-run mode configured above.
                var result = await RunImportAspireAsync(
                    builder.Resource,
                    model,
                    apphostName,
                    appHostDirectory,
                    WorkspecGraphSyncMode.Scaffold,
                    context.CancellationToken).ConfigureAwait(false);

                // Reflect the on-demand outcome in the same workspec.sync snapshot property the
                // on-run sync maintains — a successful scaffold means the tree is in sync again.
                try
                {
                    var notificationService = context.ServiceProvider.GetRequiredService<ResourceNotificationService>();
                    await PublishSyncPropertyAsync(
                        notificationService,
                        builder.Resource,
                        MapSyncResultToProperty(result, WorkspecGraphSyncMode.Scaffold)).ConfigureAwait(false);
                }
                catch (Exception ex)
                {
                    // The property is a cosmetic mirror of the result payload below — a failed
                    // publish must not turn a successful sync into a failed command.
                    context.Logger?.LogWarning(ex, "Failed to publish the workspec.sync property after Sync .workspec.");
                }

                var summary = FormatSyncSummaryMarkdown(result);

                return result.CliMissing || result.UnexpectedExit
                    ? CommandResults.Failure("Sync failed.", summary, CommandResultFormat.Markdown)
                    : CommandResults.Success("Sync complete.", summary, CommandResultFormat.Markdown);
            },
            commandOptions: new CommandOptions { IconName = "ArrowSync" });
    }

    /// <summary>
    /// Dumps the current model, locates the CLI, and runs <c>workspec-c4 import-aspire</c> in
    /// <paramref name="mode"/>. Shared by <see cref="WithGraphSync"/>'s on-run subscriber and its
    /// "Sync .workspec" dashboard command so both go through one tested code path. Never throws for a
    /// missing/misbehaving CLI — callers get a degraded <see cref="WorkspecGraphSyncResult"/> instead
    /// (see <see cref="WorkspecC4CliRunner.RunAsync"/>'s own crash-safety contract, which this builds on).
    /// </summary>
    internal static async Task<WorkspecGraphSyncResult> RunImportAspireAsync(
        WorkspecC4StudioResource resource,
        DistributedApplicationModel model,
        string apphostName,
        string appHostDirectory,
        WorkspecGraphSyncMode mode,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(resource);
        ArgumentNullException.ThrowIfNull(model);
        ArgumentException.ThrowIfNullOrWhiteSpace(appHostDirectory);

        var json = WorkspecGraphDumper.DumpToJson(model, apphostName);

        // Stable scratch path under the apphost's own obj/ — see the <remarks> on WithGraphSync for
        // why this exact convention is safe and requires no extra .gitignore entry from this package.
        var dumpDirectory = Path.Combine(appHostDirectory, "obj", "workspec-c4");
        Directory.CreateDirectory(dumpDirectory);
        var dumpPath = Path.Combine(dumpDirectory, $"{resource.Name}.graph.json");
        await File.WriteAllTextAsync(dumpPath, json, cancellationToken).ConfigureAwait(false);

        var invocation = WorkspecCliLocator.Resolve("workspec-c4", new WorkspecCliLocatorOptions { WorkingDirectory = appHostDirectory });
        var modeArg = mode == WorkspecGraphSyncMode.Scaffold ? "scaffold" : "check";

        var (exitCode, stdout, stderr) = await WorkspecC4CliRunner.RunAsync(
            invocation,
            ["import-aspire", "--graph", dumpPath, "--dir", resource.WorkspecDirectory, "--mode", modeArg, "--json"],
            appHostDirectory,
            cancellationToken).ConfigureAwait(false);

        if (exitCode == -1)
        {
            return new WorkspecGraphSyncResult(CliMissing: true, ExitCode: exitCode, Diagnostics: [], RawStderr: stderr);
        }

        if (mode == WorkspecGraphSyncMode.Scaffold)
        {
            // scaffold always exits 0 once it has a valid graph, per the CLI's own documented
            // contract (docs/aspire-hosting/import-mapping.md) — anything else is unexpected.
            return exitCode == 0
                ? new WorkspecGraphSyncResult(CliMissing: false, ExitCode: exitCode, Diagnostics: [], RawStderr: stderr)
                : new WorkspecGraphSyncResult(CliMissing: false, ExitCode: exitCode, Diagnostics: [], RawStderr: stderr, UnexpectedExit: true);
        }

        // check mode: 0 = clean, 1 = drift found — both are normal, successful runs of the CLI.
        if (exitCode is 0 or 1)
        {
            var diagnostics = WorkspecC4CliRunner.ParseDiagnostics(stdout);
            return new WorkspecGraphSyncResult(CliMissing: false, ExitCode: exitCode, Diagnostics: diagnostics, RawStderr: stderr);
        }

        // 2 (usage error) or anything else unexpected.
        return new WorkspecGraphSyncResult(CliMissing: false, ExitCode: exitCode, Diagnostics: [], RawStderr: stderr, UnexpectedExit: true);
    }

    /// <summary>
    /// Snapshot property name carrying the last sync outcome: <c>in-sync</c>, <c>drift(N)</c>, or
    /// <c>unavailable</c>. A property, deliberately NOT the resource's lifecycle <c>State</c> — see
    /// the <see cref="WithGraphSync"/> remarks for why overriding State breaks health aggregation.
    /// </summary>
    internal const string SyncPropertyName = "workspec.sync";

    /// <summary>
    /// Pure mapping from a sync outcome to the <see cref="SyncPropertyName"/> snapshot property value.
    /// Factored out as a pure function so the diagnostics-to-property mapping has direct unit test
    /// coverage independent of the eventing/logging plumbing around it.
    /// </summary>
    internal static string MapSyncResultToProperty(WorkspecGraphSyncResult result, WorkspecGraphSyncMode mode)
    {
        ArgumentNullException.ThrowIfNull(result);

        if (result.CliMissing || result.UnexpectedExit)
        {
            return "unavailable";
        }

        if (mode == WorkspecGraphSyncMode.Scaffold)
        {
            // A successful scaffold just wrote the tree to match the graph — it is in sync by construction.
            return "in-sync";
        }

        return result.Diagnostics.Count == 0 ? "in-sync" : $"drift({result.Diagnostics.Count})";
    }

    /// <summary>Builds the Markdown result payload for the "Sync .workspec" dashboard command.</summary>
    internal static string FormatSyncSummaryMarkdown(WorkspecGraphSyncResult result)
    {
        ArgumentNullException.ThrowIfNull(result);

        if (result.CliMissing)
        {
            return $"workspec-c4 CLI could not be started: {result.RawStderr}";
        }

        if (result.UnexpectedExit)
        {
            return $"workspec-c4 import-aspire exited with an unexpected code ({result.ExitCode}): {result.RawStderr}";
        }

        return string.IsNullOrWhiteSpace(result.RawStderr) ? "No changes." : result.RawStderr.Trim();
    }

    private static async Task ApplySyncResultAsync(
        WorkspecC4StudioResource resource,
        WorkspecGraphSyncResult result,
        WorkspecGraphSyncMode mode,
        ILogger logger,
        ResourceNotificationService notificationService)
    {
        if (result.CliMissing || result.UnexpectedExit)
        {
            logger.LogError(
                "workspec-c4 CLI could not be run for graph sync (exit code {ExitCode}): {Stderr}",
                result.ExitCode,
                result.RawStderr);
        }
        else if (mode == WorkspecGraphSyncMode.Check)
        {
            if (result.Diagnostics.Count == 0)
            {
                logger.LogInformation("workspec-c4 graph sync: .workspec/ is in sync with the apphost graph.");
            }
            else
            {
                foreach (var diagnostic in result.Diagnostics)
                {
                    logger.LogWarning(
                        "{File}: [{Severity}] {Code} {Message}",
                        diagnostic.File,
                        diagnostic.Severity,
                        diagnostic.Code,
                        diagnostic.Message);
                }
            }
        }
        else if (!string.IsNullOrWhiteSpace(result.RawStderr))
        {
            foreach (var line in result.RawStderr.Split('\n', StringSplitOptions.RemoveEmptyEntries))
            {
                logger.LogInformation("{Line}", line.TrimEnd('\r'));
            }
        }

        await PublishSyncPropertyAsync(notificationService, resource, MapSyncResultToProperty(result, mode)).ConfigureAwait(false);
    }

    // Upserts the workspec.sync snapshot property. Properties are health-neutral (unlike State —
    // see the WithGraphSync remarks), so this can run after every sync without perturbing
    // Running/health aggregation, and naturally flips back to "in-sync" once drift is resolved.
    private static Task PublishSyncPropertyAsync(
        ResourceNotificationService notificationService,
        WorkspecC4StudioResource resource,
        string value) =>
        notificationService.PublishUpdateAsync(resource, snapshot => snapshot with
        {
            Properties = snapshot.Properties
                .Where(p => p.Name != SyncPropertyName)
                .ToImmutableArray()
                .Add(new ResourcePropertySnapshot(SyncPropertyName, value)),
        });
}
