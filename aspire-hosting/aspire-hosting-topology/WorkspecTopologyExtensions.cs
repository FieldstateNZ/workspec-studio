using System.Text.Json;
using Aspire.Hosting.ApplicationModel;
using Aspire.Hosting.Workspec;

namespace Aspire.Hosting;

/// <summary>Adds the workspec-topology studio resource to an apphost.</summary>
public static class WorkspecTopologyExtensions
{
    /// <summary>
    /// Adds a <see cref="WorkspecTopologyStudioResource"/> that runs <c>workspec-topology serve</c>
    /// against <paramref name="dir"/>, exposing the Topology Studio workbench in the dashboard along
    /// with a "Validate" command. The CLI is resolved via <see cref="WorkspecCliLocator"/> (explicit
    /// path override → <c>WORKSPEC_CLI_TOPOLOGY</c> env var → local
    /// <c>node_modules/.bin/workspec-topology</c> → bare command on PATH).
    /// </summary>
    /// <param name="builder">The distributed application builder.</param>
    /// <param name="name">The resource name.</param>
    /// <param name="dir">
    /// Directory containing <c>.workspec/{topologies,resources,environments}</c> artifacts. A
    /// relative path is resolved eagerly (at registration time) against
    /// <c>builder.AppHostDirectory</c>, not the process working directory — same rationale as
    /// aspire-hosting-decisions'/aspire-hosting-c4's own <c>Add*</c> methods.
    /// </param>
    /// <returns>The resource builder, for further chaining.</returns>
    [AspireExport]
    public static IResourceBuilder<WorkspecTopologyStudioResource> AddWorkspecTopology(
        this IDistributedApplicationBuilder builder,
        [ResourceName] string name,
        string dir)
    {
        ArgumentNullException.ThrowIfNull(builder);
        ArgumentException.ThrowIfNullOrWhiteSpace(name);
        ArgumentException.ThrowIfNullOrWhiteSpace(dir);

        // Resolved eagerly, same rationale as aspire-hosting-decisions/aspire-hosting-c4's Add*
        // methods: a malformed path fails at registration time, and the resolved directory is stable
        // regardless of what the orchestrator later does to the process CWD.
        var resolvedDir = Path.GetFullPath(dir, builder.AppHostDirectory);
        var invocation = WorkspecCliLocator.Resolve("workspec-topology", new WorkspecCliLocatorOptions { WorkingDirectory = builder.AppHostDirectory });

        var resource = new WorkspecTopologyStudioResource(name, invocation.Command, builder.AppHostDirectory, resolvedDir);

        var resourceBuilder = builder.AddResource(resource)
            .WithInitialState(new CustomResourceSnapshot
            {
                ResourceType = "WorkspecTopology",
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
                context.Args.Add(resolvedDir);
                context.Args.Add("--port");
                context.Args.Add(resource.GetEndpoint("http").Property(EndpointProperty.TargetPort));
            })
            .WithUrlForEndpoint("http", url => url.DisplayText = "Topology")
            .WithIconName("Cloud", IconVariant.Filled)
            .ExcludeFromManifest()
            .WithWorkspecHealthCheck("http", "/api/health")
            // Deliberately enabled regardless of the resource's lifecycle state, mirroring
            // aspire-hosting-decisions'/aspire-hosting-c4's own "validate" commands: it runs the CLI
            // directly against the served directory on disk, independent of whether the `serve`
            // process is up.
            .WithCommand(
                "validate",
                "Validate",
                executeCommand: async context =>
                {
                    var result = await WorkspecCliRunner.RunAsync(
                        invocation,
                        ["validate", "--json", "--dir", resolvedDir],
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
                            return CommandResults.Failure($"validate: could not parse workspec-topology --json output ({ex.Message})");
                        }

                        var markdown = WorkspecCliRunner.FormatValidateMarkdown(diagnostics, "No diagnostics — every topology/resource/environment artifact is valid.");

                        return result.ExitCode == 0
                            ? CommandResults.Success("validate: OK", markdown, CommandResultFormat.Markdown)
                            : CommandResults.Failure("validate: found diagnostics", markdown, CommandResultFormat.Markdown);
                    }

                    return CommandResults.Failure($"validate: could not run workspec-topology ({result.Stderr.Trim()})");
                },
                commandOptions: new CommandOptions { IconName = "CheckmarkCircle" });

        return resourceBuilder;
    }
}
