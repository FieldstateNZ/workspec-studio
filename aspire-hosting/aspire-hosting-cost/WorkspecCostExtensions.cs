using System.Text.Json;
using Aspire.Hosting.ApplicationModel;
using Aspire.Hosting.Workspec;
using Microsoft.Extensions.DependencyInjection;

namespace Aspire.Hosting;

/// <summary>Adds the workspec-cost resource (stocktake/validate/report commands) to an apphost.</summary>
public static class WorkspecCostExtensions
{
    /// <summary>
    /// Adds a <see cref="WorkspecCostResource"/> exposing "Stocktake", "Report", and "Validate"
    /// dashboard commands over the <c>workspec-cost</c> CLI, resolved via
    /// <see cref="WorkspecCliLocator"/> (explicit path override → <c>WORKSPEC_CLI_COST</c> env var →
    /// local <c>node_modules/.bin/workspec-cost</c> → bare command on PATH).
    /// </summary>
    /// <remarks>
    /// Unlike <see cref="WorkspecC4Extensions.AddWorkspecC4"/>, this resource has no <c>serve</c>
    /// mode and starts no process of its own — <c>workspec-cost</c> is a one-shot CLI for every
    /// command it exposes. See <see cref="WorkspecCostResource"/>'s remarks for why publishing
    /// lifecycle <c>State</c> on this resource (below) is the correct pattern here, unlike the
    /// DCP-managed <see cref="ExecutableResource"/>/<see cref="ContainerResource"/> resources A3
    /// covers.
    /// </remarks>
    /// <param name="builder">The distributed application builder.</param>
    /// <param name="name">The resource name.</param>
    /// <param name="dir">
    /// Directory cost artifacts (<c>*.inventory.yaml</c>, <c>*.spend.yaml</c>, etc.) live under. A
    /// relative path is resolved eagerly (at registration time) against
    /// <c>builder.AppHostDirectory</c>, not the process working directory — same rationale as
    /// Core's <c>WithWorkspecGraphDump</c> and C4's <c>AddWorkspecC4</c>.
    /// </param>
    /// <returns>The resource builder, for further chaining (e.g. <see cref="WithSubscriptions"/>).</returns>
    [AspireExport]
    public static IResourceBuilder<WorkspecCostResource> AddWorkspecCost(
        this IDistributedApplicationBuilder builder,
        [ResourceName] string name,
        string dir)
    {
        ArgumentNullException.ThrowIfNull(builder);
        ArgumentException.ThrowIfNullOrWhiteSpace(name);
        ArgumentException.ThrowIfNullOrWhiteSpace(dir);

        var resolvedCostDir = Path.GetFullPath(dir, builder.AppHostDirectory);
        var invocation = WorkspecCliLocator.Resolve("workspec-cost", new WorkspecCliLocatorOptions { WorkingDirectory = builder.AppHostDirectory });

        var resource = new WorkspecCostResource(name, builder.AppHostDirectory, resolvedCostDir);

        var resourceBuilder = builder.AddResource(resource)
            .WithInitialState(new CustomResourceSnapshot
            {
                ResourceType = "WorkspecCost",
                CreationTimeStamp = DateTime.UtcNow,
                State = KnownResourceStates.NotStarted,
                Properties =
                [
                    new ResourcePropertySnapshot(CustomResourceKnownProperties.Source, resolvedCostDir),
                    new ResourcePropertySnapshot("workspec.cost.provider", "azure"),
                ],
            })
            .WithIconName("Money", IconVariant.Filled)
            .ExcludeFromManifest();

        // No process, no endpoint, nothing else drives this resource's lifecycle — flip straight to
        // Running once the resource actually exists in the model, so commands/properties render as
        // "ready" immediately (see WorkspecCostResource's remarks: publishing State here, unlike on a
        // DCP-managed resource, cannot break health aggregation because there is no DCP-driven state
        // machine underneath this resource to conflict with).
        builder.Eventing.Subscribe<AfterResourcesCreatedEvent>(async (@event, cancellationToken) =>
        {
            var notificationService = @event.Services.GetRequiredService<ResourceNotificationService>();
            await notificationService.PublishUpdateAsync(resource, snapshot => snapshot with
            {
                State = KnownResourceStates.Running,
                StartTimeStamp = DateTime.UtcNow,
            }).ConfigureAwait(false);
        });

        // All three commands below are deliberately enabled regardless of the resource's lifecycle
        // state (no CommandOptions.UpdateState gating on Running, matching workspec-c4's reviewed
        // stance on its own validate/render commands): each one runs the one-shot CLI directly
        // against the artifact directory on disk, entirely independent of this resource's own
        // (synthetic) Running state — there is no server process whose availability could gate them.
        resourceBuilder
            .WithCommand(
                "stocktake",
                "Stocktake",
                executeCommand: async context =>
                {
                    var model = context.ServiceProvider.GetRequiredService<DistributedApplicationModel>();
                    var subscriptions = ResolveEffectiveSubscriptions(resource, model);

                    if (subscriptions.Count == 0)
                    {
                        return CommandResults.Failure(
                            "stocktake: no subscriptions configured — call WithSubscriptions(\"<id>\", ...) "
                                + "explicitly. No Azure resource in this apphost has an explicit literal "
                                + "subscription scope to derive from (a subscription id is a deployment-time "
                                + "ARM scope, not something Aspire's app model otherwise carries at authoring "
                                + "time — see docs/aspire-hosting/cost-integration.md). Stocktake also needs "
                                + "Azure credentials ambient to the apphost process (DefaultAzureCredential: az "
                                + "login, environment variables, or managed identity) — workspec-cost runs as a "
                                + "child process of the apphost and inherits its environment, so whatever "
                                + "credential source the apphost process itself can use is what stocktake uses.");
                    }

                    var args = new List<string> { "stocktake" };
                    foreach (var subscriptionId in subscriptions)
                    {
                        args.Add("--subscription");
                        args.Add(subscriptionId);
                    }

                    args.Add("--dir");
                    args.Add(resolvedCostDir);

                    var result = await WorkspecCostCliRunner.RunAsync(
                        invocation,
                        args,
                        builder.AppHostDirectory,
                        context.CancellationToken).ConfigureAwait(false);

                    return result.ExitCode == 0
                        ? CommandResults.Success("stocktake: OK", FormatPlainOutputMarkdown(result.Stderr), CommandResultFormat.Markdown)
                        : CommandResults.Failure($"stocktake: {result.Stderr.Trim()}");
                },
                commandOptions: new CommandOptions { IconName = "ArrowSync" })
            .WithCommand(
                "report",
                "Report",
                executeCommand: async context =>
                {
                    // No --by: omitting it lets the CLI default to the attribution's primary
                    // dimension (its own documented default), which is exactly "report by primary
                    // dimension" — this resource has no way to know the primary dimension itself
                    // without reading the attribution artifact, which is exactly what the CLI does.
                    var result = await WorkspecCostCliRunner.RunAsync(
                        invocation,
                        ["report", "--format", "json", "--dir", resolvedCostDir],
                        builder.AppHostDirectory,
                        context.CancellationToken).ConfigureAwait(false);

                    if (result.ExitCode == 0)
                    {
                        WorkspecCostReportPayload payload;
                        try
                        {
                            payload = WorkspecCostCliRunner.ParseReportPayload(result.Stdout);
                        }
                        catch (JsonException ex)
                        {
                            return CommandResults.Failure($"report: could not parse workspec-cost --format json output ({ex.Message})");
                        }

                        var markdown = WorkspecCostMarkdownFormatter.FormatReportMarkdown(payload);
                        return CommandResults.Success("report: OK", markdown, CommandResultFormat.Markdown);
                    }

                    // report exits 2 for a usage/precondition error (e.g. "expected exactly 1
                    // inventory, found 0") — the CLI's own stderr message already says exactly what's
                    // missing (inventory and/or attribution), so it's surfaced as-is.
                    return CommandResults.Failure($"report: {result.Stderr.Trim()}");
                },
                commandOptions: new CommandOptions { IconName = "DataBarVertical" })
            .WithCommand(
                "validate",
                "Validate",
                executeCommand: async context =>
                {
                    var result = await WorkspecCostCliRunner.RunAsync(
                        invocation,
                        ["validate", "--json", "--dir", resolvedCostDir],
                        builder.AppHostDirectory,
                        context.CancellationToken).ConfigureAwait(false);

                    // Exit 0/1 both mean the CLI ran successfully and reported a diagnostics array
                    // (0 = no errors, possibly warnings; 1 = at least one error) — a normal result
                    // payload, not an exceptional one, mirroring workspec-c4's own validate contract.
                    if (result.ExitCode is 0 or 1)
                    {
                        IReadOnlyList<WorkspecCostDiagnostic> diagnostics;
                        try
                        {
                            diagnostics = WorkspecCostCliRunner.ParseDiagnostics(result.Stdout);
                        }
                        catch (JsonException ex)
                        {
                            return CommandResults.Failure($"validate: could not parse workspec-cost --json output ({ex.Message})");
                        }

                        var markdown = WorkspecCostMarkdownFormatter.FormatValidateMarkdown(diagnostics);

                        return result.ExitCode == 0
                            ? CommandResults.Success("validate: OK", markdown, CommandResultFormat.Markdown)
                            : CommandResults.Failure("validate: found diagnostics", markdown, CommandResultFormat.Markdown);
                    }

                    return CommandResults.Failure($"validate: could not run workspec-cost ({result.Stderr.Trim()})");
                },
                commandOptions: new CommandOptions { IconName = "CheckmarkCircle" });

        return resourceBuilder;
    }

    /// <summary>
    /// Explicitly configures the Azure subscription ids the <c>Stocktake</c> command passes as
    /// <c>--subscription</c>. This is the primary, documented path — see
    /// <see cref="DeriveSubscriptionsFromModel"/>'s remarks for why automatic derivation from the
    /// app model is best-effort only and usually finds nothing. Each call replaces the previously
    /// configured set (not additive).
    /// </summary>
    /// <param name="builder">The workspec-cost resource builder.</param>
    /// <param name="subscriptionIds">One or more non-empty subscription ids.</param>
    [AspireExport]
    public static IResourceBuilder<WorkspecCostResource> WithSubscriptions(
        this IResourceBuilder<WorkspecCostResource> builder,
        params string[] subscriptionIds)
    {
        ArgumentNullException.ThrowIfNull(builder);
        ArgumentNullException.ThrowIfNull(subscriptionIds);

        if (subscriptionIds.Length == 0 || Array.Exists(subscriptionIds, string.IsNullOrWhiteSpace))
        {
            throw new ArgumentException("At least one non-empty subscription id is required.", nameof(subscriptionIds));
        }

        builder.Resource.Subscriptions = subscriptionIds;
        return builder;
    }

    /// <summary>
    /// Effective subscriptions for <c>Stocktake</c>: explicit <see cref="WithSubscriptions"/>
    /// configuration wins outright; otherwise falls back to whatever can be derived from the live
    /// app model via <see cref="DeriveSubscriptionsFromModel"/>.
    /// </summary>
    internal static IReadOnlyList<string> ResolveEffectiveSubscriptions(WorkspecCostResource resource, DistributedApplicationModel model) =>
        resource.Subscriptions.Count > 0 ? resource.Subscriptions : DeriveSubscriptionsFromModel(model);

    /// <summary>
    /// Best-effort automatic subscription-scope derivation from the app model.
    /// </summary>
    /// <remarks>
    /// <para>
    /// In Aspire 13.4.6, a subscription id is fundamentally a <em>deployment-time</em> ARM
    /// deployment-scope concept — it's supplied externally by whatever tool actually runs the
    /// deployment (<c>az</c>/<c>azd</c>/<c>aspire deploy</c>, via an active <c>az login</c> context or
    /// an explicit <c>--subscription</c> flag on that tool), not something the Aspire app model or
    /// the Bicep it generates carries at authoring/publish time. This was confirmed empirically
    /// while building this slice: <c>AzureEnvironmentResource</c> exposes only
    /// <c>Location</c>/<c>ResourceGroupName</c>/<c>PrincipalId</c> (each a deploy-time
    /// <c>ParameterResource</c>, not a compile-time value) — no subscription — and the Bicep Aspire
    /// generates for a plain <c>AddAzureStorage(...)</c> (via
    /// <c>AzureProvisioningResource.GetBicepTemplateString()</c>) references no subscription at all;
    /// subscription scope is decided entirely outside the Bicep template, at <c>az deployment
    /// sub create --subscription &lt;id&gt;</c> (or equivalent) time.
    /// </para>
    /// <para>
    /// The one place a literal subscription id CAN legitimately appear at authoring time is an
    /// explicit cross-subscription Bicep resource scope override
    /// (<c>AzureBicepResource.Scope.Subscription</c>) — an advanced, uncommon customization. This
    /// method walks every <see cref="Azure.AzureBicepResource"/> in the model for that one case, and
    /// otherwise returns an empty list. In the common case (no resource has an explicit scope), that
    /// means an empty list — <see cref="WithSubscriptions"/> is the primary, expected configuration
    /// path, not a fallback for a rare gap; see docs/aspire-hosting/cost-integration.md.
    /// </remarks>
    internal static IReadOnlyList<string> DeriveSubscriptionsFromModel(DistributedApplicationModel model)
    {
        ArgumentNullException.ThrowIfNull(model);

        List<string>? derived = null;
        foreach (var azureResource in model.Resources.OfType<Azure.AzureBicepResource>())
        {
            if (azureResource.Scope?.Subscription is string subscriptionId && !string.IsNullOrWhiteSpace(subscriptionId))
            {
                derived ??= [];
                if (!derived.Contains(subscriptionId, StringComparer.Ordinal))
                {
                    derived.Add(subscriptionId);
                }
            }
        }

        return derived ?? [];
    }

    // Command output for stocktake is plain, human-readable stderr text (drift summary + "wrote
    // ..." lines) — not JSON, so it's surfaced as-is rather than reformatted into a table.
    private static string FormatPlainOutputMarkdown(string stderr) =>
        string.IsNullOrWhiteSpace(stderr) ? "No output." : stderr.Trim();
}
