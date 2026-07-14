using System.Text.Json;
using Aspire.Hosting.ApplicationModel;
using Aspire.Hosting.Azure;
using Aspire.Hosting.Pipelines;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Aspire.Hosting;

/// <summary>
/// Adds a publish-time step that walks the app model's Azure provisioning resources and emits a
/// cost-estimate artifact (resource type + best-effort SKU) into the publish output directory.
/// </summary>
public static class WorkspecCostPublishEstimateExtensions
{
    /// <summary>
    /// The default artifact file name for a given resource name:
    /// <c>{resourceName}.cost-estimate.json</c>. Scoped per resource so two
    /// <see cref="WorkspecCostResource"/>s with publish estimates in one apphost can't clobber each
    /// other's artifact in the shared publish output directory.
    /// </summary>
    internal static string DefaultArtifactFileNameFor(string resourceName) => $"{resourceName}.cost-estimate.json";

    /// <summary>
    /// Registers a publish-only step that, on <c>aspire publish</c>/<c>aspire deploy</c> (never on
    /// <c>aspire run</c>), walks every <see cref="AzureProvisioningResource"/> in the app model and
    /// writes <paramref name="artifactFileName"/> (default
    /// <c>{resourceName}.cost-estimate.json</c>) into the publish output directory: one entry per
    /// generated ARM resource declaration, with its type and — where the generated Bicep exposes a
    /// recognized SKU shape with at least one literal value — its SKU. Unextractable SKUs (absent,
    /// or entirely parameter-driven) are recorded as <c>sku: null</c>, never guessed. A model with
    /// no Azure provisioning resources is a graceful no-op (a log line, no file written).
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>Mechanism.</b> Aspire 13.4.6 offers two publish-time hooks. The stable one is the
    /// <c>BeforePublishEvent</c>/<c>AfterPublishEvent</c> eventing pair (public, non-experimental,
    /// raised publish-only by the pipeline executor, with <c>builder.OnBeforePublish(...)</c>/
    /// <c>OnAfterPublish(...)</c> helper extensions — all confirmed by reflecting the installed
    /// 13.4.6 assembly). The <c>PublishingCallbackAnnotation</c>/<c>PublishingContext</c> API the
    /// Aspire docs ("Building custom deployment pipelines") describe does not exist in this package
    /// version. This method deliberately uses the other hook: the experimental
    /// <c>Aspire.Hosting.Pipelines</c> API's <c>WithPipelineStepFactory</c> resource-builder
    /// extension — registering a per-resource step named
    /// <c>workspec-cost-estimate-{resourceName}</c> (scoped by resource name: the pipeline executor
    /// keys steps by name, so two unscoped registrations would collide and fail the publish) that
    /// is <c>requiredBy</c> the well-known <c>publish</c> step, so it runs as part of any normal
    /// <c>aspire publish</c>/<c>aspire deploy</c> invocation.
    /// </para>
    /// <para>
    /// <b>Why Pipelines over the stable publish events</b> — a deliberate trade, not a lack of
    /// alternatives: (1) the stable events don't expose the pipeline output path in typed,
    /// non-experimental form — <c>--output-path</c> binds to the <c>Pipeline:OutputPath</c>
    /// configuration key, whose only typed surface is the experimental
    /// <c>PipelineOptions.OutputPath</c> (the stable <c>PublishingOptions.OutputPath</c> is the
    /// legacy manifest-publisher's option, not the pipeline's), so an event-based implementation
    /// would still be coupled to the same experimental surface, just via a stringly-typed raw
    /// config key instead of a typed property; (2) a pipeline step participates in <c>aspire
    /// publish</c>'s own progress reporting and step timeline, where a bare event handler is
    /// invisible; (3) structural parity with how Aspire itself runs Azure Bicep provisioning at
    /// publish time (pipeline steps). The cost is real: the entire <c>Aspire.Hosting.Pipelines</c>
    /// namespace is marked <c>[Experimental("ASPIREPIPELINES001")]</c> ("for evaluation purposes
    /// only... subject to change or removal" — the compiler raises it on every touched type;
    /// suppressed narrowly at the points of use below, not project-wide), so a future Aspire
    /// release may require porting this registration. Revisit when Aspire stabilizes the Pipelines
    /// surface — tracked as an A6 consideration under #39; see
    /// docs/aspire-hosting/cost-integration.md.
    /// </para>
    /// <para>
    /// <b>Verified behavior</b> (empirically, via a real <c>aspire publish --output-path
    /// &lt;dir&gt;</c> run against a throwaway apphost during this slice's development — not just
    /// read from docs): the step only executes for <c>aspire publish</c>/<c>aspire deploy</c>, never
    /// for <c>aspire run</c> or a plain <c>dotnet run</c> on the apphost; the step's
    /// <c>ExecutionContext.IsPublishMode</c> is <c>true</c> when it runs (checked defensively below
    /// anyway); and the step's <c>IOptions&lt;PipelineOptions&gt;.Value.OutputPath</c> resolves to
    /// exactly the <c>--output-path</c> passed to <c>aspire publish</c>.
    /// </para>
    /// <para>
    /// <b>SKU extraction.</b> There is no single strongly-typed Azure.Provisioning API for reading a
    /// SKU/tier/capacity generically across resource types — each type (<c>StorageAccount</c>,
    /// <c>ServiceBusNamespace</c>, <c>RedisCache</c>, ...) has its own concretely-typed <c>Sku</c>
    /// shape, and reading those typed properties requires an <c>IResourceBuilder&lt;T&gt;</c> handle
    /// to call the documented <c>ConfigureInfrastructure(Action&lt;AzureResourceInfrastructure&gt;)</c>
    /// extension against — which isn't available here (the app model, at this point, holds plain
    /// <see cref="IResource"/> instances, not the original builders they were added through).
    /// Instead, this calls the public, credential-free
    /// <see cref="AzureProvisioningResource.GetBicepTemplateString"/> — literally the same call
    /// Aspire's own manifest/publish pipeline uses to write <c>*.bicep</c> files, verified (also
    /// empirically) to run fully offline with no Azure credentials — and pattern-matches the
    /// resulting Bicep text. This is honest about being a per-type, best-effort read, not a uniform
    /// strongly-typed one: see <see cref="WorkspecCostEstimateExtractor"/> and
    /// docs/aspire-hosting/cost-integration.md.
    /// </para>
    /// </remarks>
    /// <param name="builder">The workspec-cost resource builder.</param>
    /// <param name="artifactFileName">
    /// The artifact's file name within the publish output directory. Defaults to
    /// <c>{resourceName}.cost-estimate.json</c> (see <see cref="DefaultArtifactFileNameFor"/>).
    /// </param>
    [AspireExport]
    public static IResourceBuilder<WorkspecCostResource> WithPublishCostEstimate(
        this IResourceBuilder<WorkspecCostResource> builder,
        string? artifactFileName = null)
    {
        ArgumentNullException.ThrowIfNull(builder);
        if (artifactFileName is not null)
        {
            ArgumentException.ThrowIfNullOrWhiteSpace(artifactFileName);
        }

        var appHostDirectory = builder.ApplicationBuilder.AppHostDirectory;
        var apphostName = builder.ApplicationBuilder.Environment.ApplicationName;
        var effectiveArtifactFileName = artifactFileName ?? DefaultArtifactFileNameFor(builder.Resource.Name);

#pragma warning disable ASPIREPIPELINES001 // Chosen deliberately over the stable BeforePublish/AfterPublish events for the typed OutputPath and pipeline progress reporting — see this method's <remarks>. Accepted churn risk; revisit under A6/#39 when Aspire stabilizes the Pipelines surface.
        return builder.WithPipelineStepFactory(
            $"workspec-cost-estimate-{builder.Resource.Name}",
            context => RunEstimateStepAsync(context, appHostDirectory, apphostName, effectiveArtifactFileName),
            dependsOn: [],
            requiredBy: [WellKnownPipelineSteps.Publish],
            tags: [],
            description: "Estimate Azure resource costs from provisioning SKUs (WorkSpec Cost)");
#pragma warning restore ASPIREPIPELINES001
    }

    /// <summary>
    /// The actual publish-step body: walk the model's Azure provisioning resources, extract
    /// type/SKU per generated ARM declaration, and write the JSON artifact. Factored out of the
    /// pipeline-step registration above (which needs the experimental
    /// <c>Aspire.Hosting.Pipelines</c> types) so this logic is directly unit-testable against a
    /// plain <see cref="DistributedApplicationModel"/> without needing to drive the real,
    /// experimental pipeline executor in a test.
    /// </summary>
#pragma warning disable ASPIREPIPELINES001
    internal static async Task RunEstimateStepAsync(
        PipelineStepContext context,
        string appHostDirectory,
        string apphostName,
        string artifactFileName)
    {
        ArgumentNullException.ThrowIfNull(context);

        // Defense-in-depth: verified empirically that WithPipelineStepFactory-registered steps only
        // ever run during publish/deploy, never during `aspire run` — this guard costs nothing and
        // documents the invariant even if that framework behavior ever changes.
        if (!context.ExecutionContext.IsPublishMode)
        {
            return;
        }

        var outputPath = context.Services.GetService<IOptions<PipelineOptions>>()?.Value.OutputPath;
        await WriteEstimateArtifactAsync(
            context.Model,
            appHostDirectory,
            apphostName,
            artifactFileName,
            outputPath,
            context.Logger,
            context.CancellationToken).ConfigureAwait(false);
    }
#pragma warning restore ASPIREPIPELINES001

    /// <summary>
    /// Walks <paramref name="model"/>'s Azure provisioning resources, extracts type/SKU per
    /// generated ARM declaration, and writes the JSON artifact under <paramref name="outputPath"/>
    /// (or a conventional fallback under <paramref name="appHostDirectory"/> when
    /// <paramref name="outputPath"/> is null/blank — see this class's <see
    /// cref="WithPublishCostEstimate"/> remarks). No dependency on any experimental Pipelines type,
    /// so it's directly unit-testable.
    /// </summary>
    internal static async Task WriteEstimateArtifactAsync(
        DistributedApplicationModel model,
        string appHostDirectory,
        string apphostName,
        string artifactFileName,
        string? outputPath,
        ILogger logger,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(model);
        ArgumentException.ThrowIfNullOrWhiteSpace(appHostDirectory);
        ArgumentException.ThrowIfNullOrWhiteSpace(artifactFileName);
        ArgumentNullException.ThrowIfNull(logger);

        var armResources = new List<CostEstimateArmResource>();
        foreach (var azureResource in model.Resources.OfType<AzureProvisioningResource>())
        {
            string bicep;
            try
            {
                bicep = azureResource.GetBicepTemplateString();
            }
            catch (Exception ex)
            {
                // One resource's Bicep generation failing (e.g. a not-yet-fully-configured custom
                // resource) must not fail the whole estimate — log and move on to the rest.
                logger.LogWarning(
                    ex,
                    "workspec-cost: could not generate Bicep for Azure resource '{Resource}' — excluded from the cost estimate.",
                    azureResource.Name);
                continue;
            }

            armResources.AddRange(WorkspecCostEstimateExtractor.ExtractArmResources(azureResource.Name, bicep));
        }

        if (armResources.Count == 0)
        {
            logger.LogInformation("workspec-cost: no Azure provisioning resources in the app model — skipping the cost-estimate artifact.");
            return;
        }

        // Deterministic, model-order-independent artifact: sorted by (AspireResourceName,
        // BicepSymbol) so re-publishing an unchanged apphost yields a byte-identical resource list
        // (modulo generatedAt) and a git diff of two estimates shows only real changes — the same
        // rationale as cost-schema's own sorted-inventory contract.
        armResources.Sort((a, b) =>
        {
            var byName = string.CompareOrdinal(a.AspireResourceName, b.AspireResourceName);
            return byName != 0 ? byName : string.CompareOrdinal(a.BicepSymbol, b.BicepSymbol);
        });

        var effectiveOutputPath = outputPath;
        if (string.IsNullOrWhiteSpace(effectiveOutputPath))
        {
            // Falls back to a conventional location under the apphost directory when running
            // outside a normal `aspire publish` invocation — documented in cost-integration.md as a
            // defensive fallback, not the expected path in real usage (`aspire publish` always sets
            // --output-path, verified empirically — see WithPublishCostEstimate's remarks).
            effectiveOutputPath = Path.Combine(appHostDirectory, "cost-estimate");
            logger.LogWarning(
                "workspec-cost: no publish output path was available — writing the cost estimate under '{Fallback}' instead.",
                effectiveOutputPath);
        }

        Directory.CreateDirectory(effectiveOutputPath);

        var unknownSkuCount = armResources.Count(r => r.Sku is null);
        var document = new CostEstimateDocument(
            ApiVersion: "workspec.dev/cost-estimate/v1",
            Kind: "CostEstimate",
            Metadata: new CostEstimateMetadata(DateTime.UtcNow.ToString("O"), apphostName),
            Resources: armResources,
            Summary: new CostEstimateSummary(armResources.Count, unknownSkuCount));

        var json = JsonSerializer.Serialize(document, CostEstimateJsonOptions);
        var artifactPath = Path.Combine(effectiveOutputPath, artifactFileName);
        await File.WriteAllTextAsync(artifactPath, json, cancellationToken).ConfigureAwait(false);

        logger.LogInformation(
            "workspec-cost: wrote {Path} ({Count} resource(s), {Unknown} with unknown SKU).",
            artifactPath,
            armResources.Count,
            unknownSkuCount);
    }

    private static readonly JsonSerializerOptions CostEstimateJsonOptions = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };
}
