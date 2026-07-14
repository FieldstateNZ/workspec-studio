using System.Text.Json;
using Aspire.Hosting.ApplicationModel;
using Aspire.Hosting.Workspec;

namespace Aspire.Hosting;

/// <summary>Adds the workspec-decisions studio resource to an apphost.</summary>
public static class WorkspecDecisionsExtensions
{
    /// <summary>
    /// Adds a <see cref="WorkspecDecisionsStudioResource"/> that runs <c>workspec-decisions serve</c>
    /// against <paramref name="dir"/>, exposing the Decision Studio explorer in the dashboard along
    /// with "Validate" and "Render ADR" commands. The CLI is resolved via
    /// <see cref="WorkspecCliLocator"/> (explicit path override → <c>WORKSPEC_CLI_DECISIONS</c> env
    /// var → local <c>node_modules/.bin/workspec-decisions</c> → bare command on PATH). Use
    /// <see cref="WithDecisionExtensions.WithDecision{T}"/> to link any other resource to the decision
    /// record that governs it.
    /// </summary>
    /// <param name="builder">The distributed application builder.</param>
    /// <param name="name">The resource name.</param>
    /// <param name="dir">
    /// Directory of <c>*.decision.yaml</c>/<c>*.catalog.yaml</c> artifacts. A relative path is
    /// resolved eagerly (at registration time) against <c>builder.AppHostDirectory</c>, not the
    /// process working directory. Unlike aspire-hosting-c4's <c>.workspec/</c> tree, there is no
    /// required substructure — <c>workspec-decisions</c> scans recursively for artifacts anywhere
    /// under this directory.
    /// </param>
    /// <returns>The resource builder, for further chaining.</returns>
    [AspireExport]
    public static IResourceBuilder<WorkspecDecisionsStudioResource> AddWorkspecDecisions(
        this IDistributedApplicationBuilder builder,
        [ResourceName] string name,
        string dir)
    {
        ArgumentNullException.ThrowIfNull(builder);
        ArgumentException.ThrowIfNullOrWhiteSpace(name);
        ArgumentException.ThrowIfNullOrWhiteSpace(dir);

        // Resolved eagerly, same rationale as aspire-hosting-c4's AddWorkspecC4: a malformed path
        // fails at registration time, and the resolved directory is stable regardless of what the
        // orchestrator later does to the process CWD.
        var resolvedDir = Path.GetFullPath(dir, builder.AppHostDirectory);
        var invocation = WorkspecCliLocator.Resolve("workspec-decisions", new WorkspecCliLocatorOptions { WorkingDirectory = builder.AppHostDirectory });

        var resource = new WorkspecDecisionsStudioResource(name, invocation.Command, builder.AppHostDirectory, resolvedDir);

        var resourceBuilder = builder.AddResource(resource)
            .WithInitialState(new CustomResourceSnapshot
            {
                ResourceType = "WorkspecDecisions",
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
            .WithUrlForEndpoint("http", url => url.DisplayText = "Decisions")
            .WithIconName("Scales", IconVariant.Filled)
            .ExcludeFromManifest()
            .WithWorkspecHealthCheck("http", "/api/health")
            // Both commands below are deliberately enabled regardless of the resource's lifecycle
            // state, mirroring aspire-hosting-c4's AddWorkspecC4: they run the CLI directly against
            // the served directory on disk, independent of whether the `serve` process is up.
            .WithCommand(
                "validate",
                "Validate",
                executeCommand: async context =>
                {
                    var result = await WorkspecDecisionsCliRunner.RunAsync(
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
                        IReadOnlyList<WorkspecDecisionsCliDiagnostic> diagnostics;
                        try
                        {
                            diagnostics = WorkspecDecisionsCliRunner.ParseDiagnostics(result.Stdout);
                        }
                        catch (JsonException ex)
                        {
                            // Malformed stdout must surface as a clean failed result, not as an
                            // unhandled-exception toast in the dashboard.
                            return CommandResults.Failure($"validate: could not parse workspec-decisions --json output ({ex.Message})");
                        }

                        var markdown = WorkspecDecisionsCliRunner.FormatValidateMarkdown(diagnostics);

                        return result.ExitCode == 0
                            ? CommandResults.Success("validate: OK", markdown, CommandResultFormat.Markdown)
                            : CommandResults.Failure("validate: found diagnostics", markdown, CommandResultFormat.Markdown);
                    }

                    return CommandResults.Failure($"validate: could not run workspec-decisions ({result.Stderr.Trim()})");
                },
                commandOptions: new CommandOptions { IconName = "CheckmarkCircle" })
            .WithCommand(
                "render-adr",
                "Render ADR",
                executeCommand: async context =>
                {
                    // Discovery run: no --decision. Per packages/decision-studio/src/cli.ts's
                    // runRenderAdr, this succeeds outright when the directory holds exactly one
                    // decision (exit 0, ADR on stdout); fails listing every available ref/id when it
                    // holds more than one; fails saying so when it holds none.
                    var discovery = await WorkspecDecisionsCliRunner.RunAsync(
                        invocation,
                        ["render-adr", "--dir", resolvedDir],
                        builder.AppHostDirectory,
                        context.CancellationToken).ConfigureAwait(false);

                    if (discovery.ExitCode == 0)
                    {
                        return CommandResults.Success($"Rendered ADR ({discovery.Stdout.Length} bytes).");
                    }

                    if (discovery.ExitCode != 1)
                    {
                        // -1 (CLI missing) or an unexpected/usage exit code — the CLI couldn't even
                        // attempt discovery, so no ref could possibly resolve.
                        return CommandResults.Failure($"render-adr: could not run workspec-decisions ({discovery.Stderr.Trim()})");
                    }

                    // Exit 1 from the discovery run is one of two distinct outcomes: "no
                    // *.decision.yaml found" (nothing to render, ever — retrying with any ref is
                    // pointless) or "multiple decisions found; pass --decision <ref|id>: ..." (the
                    // ONE ambiguous case a WithDecision-registered ref can resolve). Only the latter
                    // is worth a retry.
                    if (!discovery.Stderr.Contains("multiple decisions found", StringComparison.Ordinal))
                    {
                        return CommandResults.Failure($"render-adr: {discovery.Stderr.Trim()}");
                    }

                    var fallbackRef = resource.RegisteredDecisionRefs.FirstOrDefault();
                    if (fallbackRef is null)
                    {
                        // No WithDecision ref registered either — the discovery run's own stderr
                        // already lists every available ref/id pair (the real CLI's own contract), so
                        // surface it verbatim rather than inventing our own directory scan.
                        return CommandResults.Failure($"render-adr: {discovery.Stderr.Trim()}");
                    }

                    var withRef = await WorkspecDecisionsCliRunner.RunAsync(
                        invocation,
                        ["render-adr", "--dir", resolvedDir, "--decision", fallbackRef],
                        builder.AppHostDirectory,
                        context.CancellationToken).ConfigureAwait(false);

                    return withRef.ExitCode == 0
                        ? CommandResults.Success($"Rendered ADR for '{fallbackRef}' ({withRef.Stdout.Length} bytes).")
                        : CommandResults.Failure($"render-adr: {withRef.Stderr.Trim()}");
                },
                commandOptions: new CommandOptions { IconName = "DocumentText" });

        return resourceBuilder;
    }
}
