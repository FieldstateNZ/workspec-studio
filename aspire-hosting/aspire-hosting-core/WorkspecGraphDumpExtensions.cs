using Aspire.Hosting.ApplicationModel;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Aspire.Hosting.Workspec;

/// <summary>Wires <see cref="WorkspecGraphDumper"/> into an apphost via the eventing model.</summary>
public static class WorkspecGraphDumpExtensions
{
    /// <summary>
    /// Dumps the workspec-graph/v1 document to <paramref name="path"/> once resources are created.
    /// A relative <paramref name="path"/> is resolved against <c>builder.AppHostDirectory</c> (not the
    /// process working directory, which for an apphost launched by an IDE or <c>dotnet run</c> wrapper
    /// isn't predictable). Subscribes to <c>AfterResourcesCreatedEvent</c> via
    /// <c>IDistributedApplicationEventing.Subscribe&lt;T&gt;</c> (the eventing model), not the deprecated
    /// <c>IDistributedApplicationLifecycleHook</c>. The sugared <c>builder.OnAfterResourcesCreated(...)</c>
    /// shown in the Aspire docs isn't present on <c>Aspire.Hosting 13.4.6</c>'s
    /// <c>IDistributedApplicationBuilder</c> — <c>Eventing.Subscribe&lt;T&gt;</c> is the underlying API it
    /// would have called. Only writes in run mode — publish/manifest generation is a different concern
    /// and isn't gated by this dump. A failed dump or write is logged and swallowed: the graph dump is a
    /// diagnostic side-effect and must never fault orchestration after resources are already running.
    /// </summary>
    [AspireExportIgnore(Reason = "Writes to the local filesystem via a caller-supplied path; not meaningful to export to non-C# AppHost runtimes in this slice.")]
    public static IDistributedApplicationBuilder WithWorkspecGraphDump(this IDistributedApplicationBuilder builder, string path)
    {
        ArgumentNullException.ThrowIfNull(builder);
        ArgumentException.ThrowIfNullOrWhiteSpace(path);

        // Resolved eagerly so a malformed path fails at registration time, and so the dump lands in a
        // predictable place regardless of what the orchestrator does to the process CWD later.
        var resolvedPath = Path.GetFullPath(path, builder.AppHostDirectory);

        builder.Eventing.Subscribe<AfterResourcesCreatedEvent>(async (@event, cancellationToken) =>
        {
            if (!builder.ExecutionContext.IsRunMode)
            {
                return;
            }

            try
            {
                var json = WorkspecGraphDumper.DumpToJson(@event.Model, builder.Environment.ApplicationName);
                await File.WriteAllTextAsync(resolvedPath, json, cancellationToken).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                // An unhandled exception here propagates out of the event subscriber and faults apphost
                // startup after resources are already running — log and continue instead.
                @event.Services.GetService<ILoggerFactory>()
                    ?.CreateLogger(typeof(WorkspecGraphDumpExtensions))
                    .LogError(ex, "Failed to write workspec graph dump to '{Path}'; continuing without it.", resolvedPath);
            }
        });

        return builder;
    }
}
