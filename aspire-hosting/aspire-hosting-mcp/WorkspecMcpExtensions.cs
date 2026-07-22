using Aspire.Hosting.ApplicationModel;
using Aspire.Hosting.Workspec;

namespace Aspire.Hosting;

/// <summary>Adds the aggregate workspec-mcp resource to an apphost.</summary>
public static class WorkspecMcpExtensions
{
    /// <summary>
    /// Adds a <see cref="WorkspecMcpResource"/> that runs <c>workspec-mcp --http</c> against
    /// <paramref name="dir"/>, proxying every WorkSpec Studio MCP provider (decisions/cost/c4/trace)
    /// through Aspire's built-in MCP server. The CLI is resolved via <see cref="WorkspecCliLocator"/>
    /// (explicit path override → <c>WORKSPEC_CLI_MCP</c> env var → local
    /// <c>node_modules/.bin/workspec-mcp</c> → bare command on PATH).
    /// </summary>
    /// <remarks>
    /// <para>
    /// Unlike <see cref="WorkspecDecisionsExtensions.AddWorkspecDecisions"/> and
    /// <see cref="WorkspecC4Extensions.AddWorkspecC4"/>, <c>workspec-mcp</c> has no subcommand of its
    /// own — <c>--http</c>/<c>--dir</c>/<c>--port</c>/<c>--host</c> are top-level flags (see
    /// <c>packages/mcp-host/src/cli.ts</c>), so <see cref="ResourceBuilderExtensions.WithArgs"/>
    /// below emits them directly with no leading verb.
    /// </para>
    /// <para>
    /// <see cref="McpServerResourceBuilderExtensions.WithMcpServer{T}(IResourceBuilder{T}, string, string)"/>
    /// is what actually makes this resource's tools reachable from <c>aspire mcp tools</c>/
    /// <c>aspire mcp call</c> — it registers an <c>McpServerEndpointAnnotation</c> that Aspire's own
    /// tooling uses to discover and proxy the MCP endpoint this resource serves at <c>/mcp</c>. That
    /// API is EXPERIMENTAL in Aspire.Hosting 13.4.6 (gated behind diagnostic <c>ASPIREMCP001</c>),
    /// hence the narrowly-scoped <c>#pragma warning disable</c> around the one call site below — see
    /// docs/aspire-hosting/mcp-integration.md.
    /// </para>
    /// </remarks>
    /// <param name="builder">The distributed application builder.</param>
    /// <param name="name">The resource name.</param>
    /// <param name="dir">
    /// Directory shared by every MCP provider the aggregate host assembles — decisions/cost/c4/trace
    /// each read and write their own artifact kinds under this one tree (see
    /// <c>packages/mcp-host/src/cli.ts</c>). A relative path is resolved eagerly (at registration
    /// time) against <c>builder.AppHostDirectory</c>, not the process working directory — same
    /// rationale as the other module integrations' own <c>Add*</c> methods. The tool list this
    /// resource exposes is static regardless of which artifact kinds actually exist under
    /// <paramref name="dir"/> — a directory with only decision records still exposes all 34 tools,
    /// the cost/c4/trace ones simply operate against an empty tree until matching artifacts appear.
    /// </param>
    /// <returns>The resource builder, for further chaining.</returns>
    [AspireExport]
    public static IResourceBuilder<WorkspecMcpResource> AddWorkspecMcp(
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
        var invocation = WorkspecCliLocator.Resolve("workspec-mcp", new WorkspecCliLocatorOptions { WorkingDirectory = builder.AppHostDirectory });

        var resource = new WorkspecMcpResource(name, invocation.Command, builder.AppHostDirectory, resolvedDir);

        var resourceBuilder = builder.AddResource(resource)
            .WithInitialState(new CustomResourceSnapshot
            {
                ResourceType = "WorkspecMcp",
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

                context.Args.Add("--http");
                context.Args.Add("--dir");
                context.Args.Add(resolvedDir);
                context.Args.Add("--port");
                context.Args.Add(resource.GetEndpoint("http").Property(EndpointProperty.TargetPort));
                context.Args.Add("--host");
                context.Args.Add("127.0.0.1");
            })
            .WithUrlForEndpoint("http", url => url.DisplayText = "MCP")
            .WithIconName("PlugConnected", IconVariant.Filled)
            .ExcludeFromManifest()
            .WithWorkspecHealthCheck("http", "/health");

        // Split into its own statement (rather than tacked onto the fluent chain above) so the
        // pragma below scopes as narrowly as possible: the ASPIREMCP001 diagnostic's reported
        // location spans the whole invocation-expression tree it's called on, which for a chained
        // call would mean the entire builder.AddResource(...)... chain above — not just this one
        // call (confirmed empirically while building this slice).
#pragma warning disable ASPIREMCP001 // WithMcpServer is EXPERIMENTAL in Aspire.Hosting 13.4.6.
        resourceBuilder = resourceBuilder.WithMcpServer("/mcp", endpointName: "http");
#pragma warning restore ASPIREMCP001

        return resourceBuilder;
    }
}
