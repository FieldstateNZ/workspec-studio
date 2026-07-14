using System.Text;
using System.Text.RegularExpressions;

namespace Aspire.Hosting;

/// <summary>
/// Extracts ARM resource type + best-effort SKU from one Azure provisioning resource's generated
/// Bicep text (<see cref="Aspire.Hosting.Azure.AzureProvisioningResource.GetBicepTemplateString"/>).
/// </summary>
/// <remarks>
/// This is deliberately a small, honest pattern-matcher over the deterministic, tool-generated
/// Bicep Aspire itself emits — NOT a general Bicep parser. It recognizes exactly the shapes
/// confirmed (empirically, against real generated Bicep during this slice's development) for
/// Aspire's own Azure integrations: a top-level <c>resource &lt;symbol&gt; '&lt;type&gt;@&lt;api
/// version&gt;' = { ... }</c> declaration, optionally containing a flat <c>sku: { name: '...',
/// tier: '...', capacity: N }</c> object (any subset of those three fields) or a bare <c>sku:
/// '...'</c> string. There is no single strongly-typed Azure.Provisioning API that exposes
/// SKU/tier/capacity uniformly across resource types (each has its own concretely-typed <c>Sku</c>
/// shape), and reading those typed properties would require an <c>IResourceBuilder&lt;T&gt;</c>
/// handle this code doesn't have (see <see cref="WorkspecCostPublishEstimateExtensions"/>'s
/// remarks) — so this extracts from the text Aspire itself already generates instead. A resource
/// type whose Bicep doesn't match either sku shape (or has none) yields <c>Sku: null</c> — a
/// documented gap, not a guess. See docs/aspire-hosting/cost-integration.md.
/// </remarks>
internal static class WorkspecCostEstimateExtractor
{
    private static readonly Regex ResourceDeclarationRegex = new(
        @"^\s*resource\s+(?<symbol>[A-Za-z_][A-Za-z0-9_]*)\s+'(?<type>[^@']+)@(?<version>[^']+)'\s*(?:existing\s*)?=\s*\{",
        RegexOptions.Compiled);

    private static readonly Regex SkuObjectRegex = new(@"sku\s*:\s*\{(?<body>[^{}]*)\}", RegexOptions.Compiled);
    private static readonly Regex SkuLiteralRegex = new(@"sku\s*:\s*'(?<value>[^']*)'", RegexOptions.Compiled);
    private static readonly Regex SkuNameRegex = new(@"name\s*:\s*'(?<value>[^']*)'", RegexOptions.Compiled);
    private static readonly Regex SkuTierRegex = new(@"tier\s*:\s*'(?<value>[^']*)'", RegexOptions.Compiled);
    private static readonly Regex SkuCapacityRegex = new(@"capacity\s*:\s*(?<value>\d+)", RegexOptions.Compiled);

    // Control-plane/IAM constructs Aspire synthesizes alongside real infrastructure (e.g. a
    // "<resource>-roles" companion AzureProvisioningResource for RBAC role assignments) — never
    // billable, so excluded from the estimate. Confirmed empirically: a bare
    // `AddAzureStorage("storage")` call (no consumer even referencing it) already produces a
    // SEPARATE "storage-roles" resource in the model whose Bicep contains only
    // Microsoft.Authorization/roleAssignments declarations.
    private const string RoleAssignmentTypePrefix = "Microsoft.Authorization/";

    /// <summary>
    /// Extracts every non-role-assignment ARM resource declaration from <paramref name="bicep"/>,
    /// tagging each with <paramref name="aspireResourceName"/> (the Aspire app-model resource name it
    /// came from).
    /// </summary>
    public static IReadOnlyList<CostEstimateArmResource> ExtractArmResources(string aspireResourceName, string bicep)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(aspireResourceName);
        ArgumentNullException.ThrowIfNull(bicep);

        var results = new List<CostEstimateArmResource>();
        var lines = bicep.Replace("\r\n", "\n", StringComparison.Ordinal).Split('\n');

        for (var i = 0; i < lines.Length; i++)
        {
            var match = ResourceDeclarationRegex.Match(lines[i]);
            if (!match.Success)
            {
                continue;
            }

            var type = match.Groups["type"].Value;
            var (blockText, endLineIndex) = CollectBlock(lines, i);
            i = endLineIndex;

            if (type.StartsWith(RoleAssignmentTypePrefix, StringComparison.Ordinal))
            {
                continue;
            }

            results.Add(new CostEstimateArmResource(
                aspireResourceName,
                match.Groups["symbol"].Value,
                type,
                match.Groups["version"].Value,
                ExtractSku(blockText)));
        }

        return results;
    }

    /// <summary>
    /// Collects the full <c>{ ... }</c> block starting at <paramref name="startLine"/> (which
    /// contains the declaration's own opening brace) by counting braces character-by-character
    /// until the count returns to zero. Aspire's own generated Bicep never contains a literal
    /// <c>{</c>/<c>}</c> inside a string literal outside of a balanced <c>${...}</c> interpolation
    /// expression, so a plain character count is sufficient here — this is not a general Bicep
    /// parser and isn't meant to handle arbitrary hand-written Bicep.
    /// </summary>
    private static (string BlockText, int EndLineIndex) CollectBlock(string[] lines, int startLine)
    {
        var depth = 0;
        var sawOpenBrace = false;
        var blockText = new StringBuilder();

        for (var i = startLine; i < lines.Length; i++)
        {
            var line = lines[i];
            foreach (var ch in line)
            {
                if (ch == '{')
                {
                    depth++;
                    sawOpenBrace = true;
                }
                else if (ch == '}')
                {
                    depth--;
                }
            }

            blockText.Append(line).Append('\n');

            if (sawOpenBrace && depth <= 0)
            {
                return (blockText.ToString(), i);
            }
        }

        return (blockText.ToString(), lines.Length - 1);
    }

    private static CostEstimateSku? ExtractSku(string blockText)
    {
        var objectMatch = SkuObjectRegex.Match(blockText);
        if (objectMatch.Success)
        {
            var body = objectMatch.Groups["body"].Value;
            var name = MatchOrNull(SkuNameRegex, body);
            var tier = MatchOrNull(SkuTierRegex, body);
            var capacityText = MatchOrNull(SkuCapacityRegex, body);
            var capacity = capacityText is not null && int.TryParse(capacityText, out var parsed) ? parsed : (int?)null;

            // A sku block whose every field is a parameter/expression reference rather than a
            // literal (e.g. `sku: { name: sku }` with `param sku string = 'Standard'` — the real
            // shape AddAzureServiceBus generates by default) resolves nothing here. That is an
            // UNKNOWN sku, not an empty-but-known one: return null so the artifact records
            // `sku: null` and the summary's unknownSkuCount counts it.
            return name is null && tier is null && capacity is null
                ? null
                : new CostEstimateSku(name, tier, capacity);
        }

        var literalMatch = SkuLiteralRegex.Match(blockText);
        return literalMatch.Success ? new CostEstimateSku(literalMatch.Groups["value"].Value, null, null) : null;
    }

    private static string? MatchOrNull(Regex regex, string input)
    {
        var match = regex.Match(input);
        return match.Success ? match.Groups["value"].Value : null;
    }
}
