using System.Text.Json;
using Aspire.Hosting.ApplicationModel;
using Aspire.Hosting.Workspec;

namespace Aspire.Hosting;

/// <summary>Adds the workspec-c4 studio resource to an apphost.</summary>
public static class WorkspecC4Extensions
{
    /// <summary>
    /// Adds a <see cref="WorkspecC4StudioResource"/> that runs <c>workspec-c4 serve</c> against
    /// <paramref name="workspecDir"/>, exposing the C4 model explorer in the dashboard along with
    /// "Validate" and "Render diagram" commands. The CLI is resolved via
    /// <see cref="WorkspecCliLocator"/> (explicit path override → <c>WORKSPEC_CLI_C4</c> env var →
    /// local <c>node_modules/.bin/workspec-c4</c> → bare command on PATH). Combine with
    /// <see cref="WorkspecGraphSyncExtensions.WithGraphSync"/> to keep <c>.workspec/</c> in sync with
    /// the apphost's own resource graph.
    /// </summary>
    /// <param name="builder">The distributed application builder.</param>
    /// <param name="name">The resource name.</param>
    /// <param name="workspecDir">
    /// Path to the apphost's <c>.workspec/</c> directory. A relative path is resolved eagerly (at
    /// registration time) against <c>builder.AppHostDirectory</c>, not the process working directory.
    /// </param>
    /// <returns>The resource builder, for further chaining.</returns>
    [AspireExport]
    public static IResourceBuilder<WorkspecC4StudioResource> AddWorkspecC4(
        this IDistributedApplicationBuilder builder,
        [ResourceName] string name,
        string workspecDir)
    {
        ArgumentNullException.ThrowIfNull(builder);
        ArgumentException.ThrowIfNullOrWhiteSpace(name);
        ArgumentException.ThrowIfNullOrWhiteSpace(workspecDir);

        // Resolved eagerly, same rationale as Core's WithWorkspecGraphDump: a malformed path fails at
        // registration time, and the resolved directory is stable regardless of what the orchestrator
        // later does to the process CWD.
        var resolvedWorkspecDir = Path.GetFullPath(workspecDir, builder.AppHostDirectory);
        var invocation = WorkspecCliLocator.Resolve("workspec-c4", new WorkspecCliLocatorOptions { WorkingDirectory = builder.AppHostDirectory });

        var resource = new WorkspecC4StudioResource(name, invocation.Command, builder.AppHostDirectory, resolvedWorkspecDir);

        var resourceBuilder = builder.AddResource(resource)
            .WithInitialState(new CustomResourceSnapshot
            {
                ResourceType = "WorkspecC4",
                CreationTimeStamp = DateTime.UtcNow,
                State = KnownResourceStates.NotStarted,
                Properties = [],
            })
            .WithHttpEndpoint(name: "http")
            .WithArgs(context =>
            {
                foreach (var prefixArg in invocation.ArgsPrefix)
                {
                    context.Args.Add(prefixArg);
                }

                context.Args.Add("serve");
                context.Args.Add("--dir");
                context.Args.Add(resolvedWorkspecDir);
                context.Args.Add("--port");
                context.Args.Add(resource.GetEndpoint("http").Property(EndpointProperty.TargetPort));
            })
            .WithUrlForEndpoint("http", url => url.DisplayText = "C4 Explorer")
            .WithIconName("Diagram", IconVariant.Filled)
            .ExcludeFromManifest()
            .WithWorkspecHealthCheck("http", "/api/health")
            // Both commands below are deliberately enabled regardless of the resource's lifecycle
            // state (no CommandOptions.UpdateState gating on Running, diverging from the idiomatic
            // pattern in Aspire's own docs): they run the CLI directly against the .workspec/ tree
            // on disk, entirely independent of whether the `serve` process is up. Validating or
            // rendering a tree while the explorer is stopped/crashed is a legitimate — arguably the
            // most useful — time to do it.
            .WithCommand(
                "validate",
                "Validate",
                executeCommand: async context =>
                {
                    var result = await WorkspecCliRunner.RunAsync(
                        invocation,
                        ["validate", "--json", "--dir", resolvedWorkspecDir],
                        builder.AppHostDirectory,
                        context.CancellationToken).ConfigureAwait(false);

                    // Exit 0/1 both mean the CLI ran successfully and reported a diagnostics array
                    // (0 = no errors, 1 = at least one error) — this is a normal result payload, not
                    // an exceptional one, even when it's reporting a failure state. Anything else
                    // (2 = usage error, or the synthesized -1 from a process-start failure) means the
                    // CLI itself couldn't produce a diagnostics array at all.
                    if (result.ExitCode is 0 or 1)
                    {
                        IReadOnlyList<WorkspecCliDiagnostic> diagnostics;
                        try
                        {
                            diagnostics = WorkspecCliRunner.ParseDiagnostics(result.Stdout);
                        }
                        catch (JsonException ex)
                        {
                            // Malformed stdout must surface as a clean failed result, not as an
                            // unhandled-exception toast in the dashboard.
                            return CommandResults.Failure($"validate: could not parse workspec-c4 --json output ({ex.Message})");
                        }

                        var markdown = WorkspecCliRunner.FormatValidateMarkdown(diagnostics, "No diagnostics — the `.workspec/` model is clean.");

                        return result.ExitCode == 0
                            ? CommandResults.Success("validate: OK", markdown, CommandResultFormat.Markdown)
                            : CommandResults.Failure("validate: found diagnostics", markdown, CommandResultFormat.Markdown);
                    }

                    return CommandResults.Failure($"validate: could not run workspec-c4 ({result.Stderr.Trim()})");
                },
                commandOptions: new CommandOptions { IconName = "CheckmarkCircle" })
            .WithCommand(
                "render-diagram",
                "Render diagram",
                executeCommand: async context =>
                {
                    var result = await WorkspecCliRunner.RunAsync(
                        invocation,
                        ["render", "aspire-container", "--dir", resolvedWorkspecDir, "--out", "-"],
                        builder.AppHostDirectory,
                        context.CancellationToken).ConfigureAwait(false);

                    // Kept minimal per spec: the byte count is enough confirmation signal, the full
                    // SVG payload isn't worth dumping into a command result.
                    return result.ExitCode == 0
                        ? CommandResults.Success($"Rendered aspire-container.svg ({result.Stdout.Length} bytes).")
                        : CommandResults.Failure($"render: {result.Stderr.Trim()}");
                },
                commandOptions: new CommandOptions { IconName = "Image" });

        return resourceBuilder;
    }
}
