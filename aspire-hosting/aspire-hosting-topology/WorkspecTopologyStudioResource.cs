namespace Aspire.Hosting.ApplicationModel;

/// <summary>
/// An executable resource that runs the <c>workspec-topology</c> CLI's local host
/// (<c>workspec-topology serve</c>), exposing the Topology Studio explorer for a directory of
/// <c>*.topology.yaml</c>/<c>*.resource.yaml</c>/<c>*.environment.yaml</c> artifacts under
/// <c>.workspec/{topologies,resources,environments}</c>.
/// </summary>
/// <remarks>
/// <see cref="TopologyDirectory"/> is a plain CLR property, not an ATS-exposed capability (this type
/// doesn't set <c>ExposeProperties = true</c>) — same rationale as
/// <c>WorkspecDecisionsStudioResource.DecisionsDirectory</c> and
/// <c>WorkspecC4StudioResource.WorkspecDirectory</c>: it lets extension methods that only receive an
/// <see cref="IResourceBuilder{T}"/> of this resource recover the resolved directory via
/// <c>builder.Resource.TopologyDirectory</c> without it being re-passed as a parameter everywhere.
/// Like C4's <c>.workspec/</c> tree (and unlike decisions'), this directory has a required
/// substructure — <c>workspec-topology</c> discovers artifacts under
/// <c>.workspec/{topologies,resources,environments}</c> specifically, not recursively anywhere
/// underneath it.
/// </remarks>
[AspireExport]
public sealed class WorkspecTopologyStudioResource(string name, string command, string workingDirectory, string topologyDirectory)
    : ExecutableResource(name, command, workingDirectory)
{
    /// <summary>The resolved, absolute directory of topology/resource/environment artifacts this resource serves.</summary>
    public string TopologyDirectory { get; } = topologyDirectory;
}
