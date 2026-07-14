namespace Aspire.Hosting.ApplicationModel;

/// <summary>
/// A custom, non-DCP-managed resource that runs the one-shot <c>workspec-cost</c> CLI
/// (stocktake/validate/report) against a cost artifacts directory.
/// </summary>
/// <remarks>
/// <para>
/// Unlike <c>WorkspecC4StudioResource</c> (an <see cref="ExecutableResource"/> wrapping the
/// long-running <c>workspec-c4 serve</c> process), <c>workspec-cost</c> has no serve mode — every
/// command it exposes (stocktake, validate, report) is a one-shot CLI invocation. This resource
/// therefore never starts a child process of its own; it exists purely to host the dashboard
/// commands and carry lifecycle <c>State</c>/properties. There is no DCP process, container, or
/// endpoint behind it at all.
/// </para>
/// <para>
/// This is exactly why publishing lifecycle <c>State</c> here (see
/// <c>WorkspecCostExtensions.AddWorkspecCost</c>) is safe, in contrast to A3's reviewed lesson
/// about C4/Decisions' DCP-managed <see cref="ExecutableResource"/>/<see cref="ContainerResource"/>
/// resources (where publishing <c>State</c> independently of the DCP-driven lifecycle nulls
/// <c>CustomResourceSnapshot.ComputeHealthStatus</c>'s aggregate health computation). A plain
/// <see cref="Resource"/> with no DCP orchestration behind it has no such state machine to
/// conflict with — explicitly publishing <c>Running</c> via <c>ResourceNotificationService</c>
/// once the resource is registered is the documented, correct pattern for this shape of resource
/// (see the Aspire docs, "Build custom Aspire resources" — the MailDev/Talking-Clock-style
/// custom-resource example, which does exactly this: <c>WithInitialState</c> plus an
/// <c>AfterResourcesCreatedEvent</c> subscriber that flips <c>State</c> to <c>Running</c>).
/// </para>
/// </remarks>
[AspireExport]
public sealed class WorkspecCostResource(string name, string workingDirectory, string costDirectory)
    : Resource(name)
{
    /// <summary>The apphost directory the <c>workspec-cost</c> CLI is invoked from (its process working directory).</summary>
    public string WorkingDirectory { get; } = workingDirectory;

    /// <summary>
    /// The resolved, absolute directory <c>workspec-cost</c> commands scan for cost artifacts
    /// (<c>*.inventory.yaml</c>, <c>*.spend.yaml</c>, <c>*.attribution.yaml</c>, <c>*.tagplan.yaml</c>).
    /// </summary>
    public string CostDirectory { get; } = costDirectory;

    /// <summary>
    /// Azure subscription ids the <c>Stocktake</c> command passes as <c>--subscription</c>.
    /// Populated by <see cref="Aspire.Hosting.WorkspecCostExtensions.WithSubscriptions"/>; empty by
    /// default (see that method's remarks — automatic derivation from the app model is best-effort
    /// and, in the common case, finds nothing, since a subscription is a deployment-time ARM scope
    /// concept that Aspire's own app model does not carry at authoring time).
    /// </summary>
    public IReadOnlyList<string> Subscriptions { get; internal set; } = [];
}
