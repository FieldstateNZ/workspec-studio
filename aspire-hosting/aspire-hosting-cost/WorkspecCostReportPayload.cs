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
/// <c>[AspireExport]</c> member, so it needs no ATS attribute of its own.
/// </summary>
internal sealed record WorkspecCostReportPayload(
    WorkspecCostRollup Rollup,
    IReadOnlyList<WorkspecCostCoverage> Coverage,
    WorkspecCostTotals Totals);
