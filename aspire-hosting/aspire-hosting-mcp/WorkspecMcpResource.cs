namespace Aspire.Hosting.ApplicationModel;

/// <summary>
/// An executable resource that runs the aggregate <c>workspec-mcp</c> CLI
/// (<c>packages/mcp-host</c>) in <c>--http</c> mode, serving every WorkSpec Studio MCP provider
/// (decisions/cost/c4/trace/topology, namespaced
/// <c>decisions_*</c>/<c>cost_*</c>/<c>c4_*</c>/<c>trace_*</c>/<c>topology_*</c>) as a single
/// stateless MCP endpoint over one shared artifacts directory.
/// </summary>
/// <remarks>
/// <para>
/// <see cref="McpDirectory"/> is a plain CLR property, not an ATS-exposed capability (this type
/// doesn't set <c>ExposeProperties = true</c>) — same rationale as
/// <c>WorkspecDecisionsStudioResource.DecisionsDirectory</c> and
/// <c>WorkspecC4StudioResource.WorkspecDirectory</c>: it lets extension methods that only receive
/// an <see cref="IResourceBuilder{T}"/> of this resource recover the resolved directory via
/// <c>builder.Resource.McpDirectory</c> without it being re-passed as a parameter everywhere.
/// </para>
/// <para>
/// Unlike the per-module <c>workspec-decisions</c>/<c>workspec-c4</c> studio hosts, this resource
/// exposes no dashboard commands and no Decision-Studio-style explorer UI of its own — its only
/// purpose is to run the aggregate MCP server and let
/// <see cref="Aspire.Hosting.WorkspecMcpExtensions.AddWorkspecMcp"/>'s
/// <c>WithMcpServer</c> call proxy its tools through Aspire's built-in MCP server (see
/// docs/aspire-hosting/mcp-integration.md).
/// </para>
/// </remarks>
[AspireExport]
public sealed class WorkspecMcpResource(string name, string command, string workingDirectory, string mcpDirectory)
    : ExecutableResource(name, command, workingDirectory)
{
    /// <summary>
    /// The resolved, absolute directory shared by every MCP provider this resource aggregates.
    /// Each of decisions/cost/c4/trace/topology reads and writes its own artifact kinds under this
    /// one tree — see <c>packages/mcp-host/src/cli.ts</c>.
    /// </summary>
    public string McpDirectory { get; } = mcpDirectory;
}
