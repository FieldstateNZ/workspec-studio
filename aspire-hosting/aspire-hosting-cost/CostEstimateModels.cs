namespace Aspire.Hosting;

/// <summary>
/// A resource's SKU, as best-effort extracted from generated Bicep (see
/// <see cref="WorkspecCostEstimateExtractor"/>). Any field the extractor couldn't find in the
/// generated Bicep is <c>null</c> — never guessed.
/// </summary>
internal sealed record CostEstimateSku(string? Name, string? Tier, int? Capacity);

/// <summary>One ARM resource declaration extracted from one Azure provisioning resource's generated Bicep.</summary>
/// <param name="AspireResourceName">The Aspire app-model resource name this declaration came from (e.g. <c>"storage"</c>).</param>
/// <param name="BicepSymbol">The Bicep symbolic resource name within that resource's template.</param>
/// <param name="Type">The ARM resource type, e.g. <c>"Microsoft.Storage/storageAccounts"</c>.</param>
/// <param name="ApiVersion">The ARM API version the declaration targets.</param>
/// <param name="Sku">The extracted SKU, or <c>null</c> if the generated Bicep doesn't expose one in a recognized shape.</param>
internal sealed record CostEstimateArmResource(
    string AspireResourceName,
    string BicepSymbol,
    string Type,
    string ApiVersion,
    CostEstimateSku? Sku);

/// <summary>Cost-estimate artifact identity: when it was generated, and for which apphost.</summary>
internal sealed record CostEstimateMetadata(string GeneratedAt, string Apphost);

/// <summary>Headline counts for the estimate — how many resources, and how many have no extractable SKU.</summary>
internal sealed record CostEstimateSummary(int ResourceCount, int UnknownSkuCount);

/// <summary>
/// The <c>cost-estimate.json</c> publish artifact's root shape. Borrows its resource-list shape
/// loosely from <c>@workspec/cost-schema</c>'s <c>Inventory</c> artifact (a list of provider
/// resources with an id/type), but is deliberately its own, simpler shape rather than a literal
/// <c>Inventory</c>: at publish time (before anything is actually deployed), there is no resource
/// group, subscription, location, or ARM resource id yet — only a resource TYPE and (best-effort)
/// SKU are known. See docs/aspire-hosting/cost-integration.md for the full shape and its documented
/// gaps.
/// </summary>
internal sealed record CostEstimateDocument(
    string ApiVersion,
    string Kind,
    CostEstimateMetadata Metadata,
    IReadOnlyList<CostEstimateArmResource> Resources,
    CostEstimateSummary Summary);
