namespace Aspire.Hosting.ApplicationModel;

/// <summary>
/// An executable resource that runs the <c>workspec-decisions</c> CLI's local host
/// (<c>workspec-decisions serve</c>), exposing the Decision Studio explorer for a directory of
/// <c>*.decision.yaml</c>/<c>*.catalog.yaml</c> artifacts.
/// </summary>
/// <remarks>
/// <para>
/// <see cref="DecisionsDirectory"/> is a plain CLR property, not an ATS-exposed capability (this type
/// doesn't set <c>ExposeProperties = true</c>) — same rationale as aspire-hosting-c4's
/// <c>WorkspecC4StudioResource.WorkspecDirectory</c>: it lets extension methods that only receive an
/// <see cref="IResourceBuilder{T}"/> of this resource recover the resolved directory via
/// <c>builder.Resource.DecisionsDirectory</c> without it being re-passed as a parameter everywhere.
/// Unlike C4's <c>.workspec/</c> tree, this directory has no required substructure — decision/catalog
/// YAML files may live anywhere underneath it (<c>workspec-decisions</c> scans recursively); see
/// docs/aspire-hosting/decisions-integration.md.
/// </para>
/// <para>
/// <see cref="RegisteredDecisionRefs"/> is internal plumbing populated by
/// <c>WithDecisionExtensions.WithDecision</c> as apphost code annotates other resources with the
/// decision that governs them. The "Render ADR" dashboard command
/// (<see cref="Aspire.Hosting.WorkspecDecisionsExtensions.AddWorkspecDecisions"/>) consults it — in
/// call order, first registered wins — as its fallback when the served directory doesn't contain
/// exactly one decision. It is not an ATS-exported capability: it is mutated only by this assembly's
/// own <c>WithDecision</c> extension, never read or written across the ATS boundary.
/// </para>
/// </remarks>
[AspireExport]
public sealed class WorkspecDecisionsStudioResource(string name, string command, string workingDirectory, string decisionsDirectory)
    : ExecutableResource(name, command, workingDirectory)
{
    /// <summary>The resolved, absolute directory of decision/catalog artifacts this resource serves.</summary>
    public string DecisionsDirectory { get; } = decisionsDirectory;

    private readonly List<string> _registeredDecisionRefs = [];

    /// <summary>
    /// Decision refs registered via <c>WithDecision</c>, in call order (not deduplicated — a ref
    /// registered by two different governed resources appears twice, which is harmless since only
    /// the first element is ever consulted). See the type-level remarks.
    /// </summary>
    internal IReadOnlyList<string> RegisteredDecisionRefs => _registeredDecisionRefs;

    /// <summary>Appends a decision ref registered via <c>WithDecision</c>.</summary>
    internal void RegisterDecisionRef(string decisionRef) => _registeredDecisionRefs.Add(decisionRef);
}
