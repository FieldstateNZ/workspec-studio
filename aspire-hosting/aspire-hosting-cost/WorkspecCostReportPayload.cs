using System.Text.Json;

namespace Aspire.Hosting;

/// <summary>One bucket in a rollup: a declared dimension value id, or <c>"unattributed"</c>.</summary>
internal sealed record WorkspecCostRollupBucket(string Key, double Amount);

/// <summary>A dimension's spend rollup — mirrors <c>@workspec/cost-engine</c>'s <c>Rollup</c>.</summary>
internal sealed record WorkspecCostRollup(string DimensionId, IReadOnlyList<WorkspecCostRollupBucket> Buckets);

/// <summary>Attribution coverage for one dimension — mirrors <c>@workspec/cost-engine</c>'s <c>Coverage</c>.</summary>
internal sealed record WorkspecCostCoverage(
    string DimensionId,
    bool IsPrimary,
    double AttributedSpend,
    double UnattributedSpend,
    double Ratio,
    int UnattributedCount,
    double TotalSpend);

/// <summary>Spend totals — mirrors <c>@workspec/cost-engine</c>'s <c>Totals</c> (only the fields this markdown formatter needs).</summary>
internal sealed record WorkspecCostTotals(
    double TotalSpend,
    double InventorySpend,
    double OrphanSpend,
    double UnresolvedSpend,
    int ResourcesWithoutSpend,
    IReadOnlyList<string> Currencies);

/// <summary>
/// JSON-deserialization target for <c>workspec-cost report --format json</c>'s stdout payload:
/// <c>{ rollup, coverage, totals }</c> (see <c>packages/cost-studio/src/cli.ts</c>'s <c>runReport</c>
/// for the source shape). Purely internal plumbing — never a parameter or return type of an
/// <c>[AspireExport]</c> member, so it needs no ATS attribute of its own. Cost-specific (unlike the
/// diagnostics array, no other module integration has an equivalent "report" shape), so — unlike
/// <c>WorkspecCliDiagnostic</c>/<c>WorkspecCliRunner</c> — this stays in this package rather than
/// promoting to Core (A6, #39).
/// </summary>
internal sealed record WorkspecCostReportPayload(
    WorkspecCostRollup Rollup,
    IReadOnlyList<WorkspecCostCoverage> Coverage,
    WorkspecCostTotals Totals)
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    /// <summary>Parses a workspec-cost <c>report --format json</c> stdout payload: <c>{ rollup, coverage, totals }</c>.</summary>
    public static WorkspecCostReportPayload Parse(string stdout)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(stdout);

        return JsonSerializer.Deserialize<WorkspecCostReportPayload>(stdout, JsonOptions)
            ?? throw new JsonException("workspec-cost report --format json produced a null payload.");
    }
}
