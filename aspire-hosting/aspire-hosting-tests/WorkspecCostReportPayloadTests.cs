using System.Text.Json;
using Aspire.Hosting;
using Aspire.Hosting.Workspec;

namespace Aspire.Hosting.Workspec.Tests;

/// <summary>
/// Direct unit coverage for <see cref="WorkspecCostReportPayload.Parse"/> — the JSON-deserialization
/// shape of <c>workspec-cost report --format json</c>'s stdout, which is cost-specific (no other
/// module integration has an equivalent "report" payload) and so was NOT promoted into
/// <c>Aspire.Hosting.Workspec.Core</c> alongside <see cref="WorkspecCliRunner"/>/
/// <see cref="WorkspecCliDiagnostic"/> in A6 (#39). <see cref="WorkspecCostCommandsTests"/> exercises
/// the same fixtures end-to-end through the "Report" dashboard command, but only asserts on the
/// rendered Markdown — these tests pin the exact deserialized field values (dimension id, bucket
/// counts/amounts, coverage, totals) directly, which the command-level Markdown assertions only
/// exercise indirectly.
/// </summary>
public class WorkspecCostReportPayloadTests
{
    private static readonly string FixturesDirectory = Path.Combine(AppContext.BaseDirectory, "Fixtures");

    [Fact]
    public async Task Parse_WithReportOkFixture_ParsesRollupCoverageAndTotals()
    {
        var invocation = new WorkspecCliInvocation(Path.Combine(FixturesDirectory, "fake-workspec-cost-report-ok.sh"));

        var result = await WorkspecCliRunner.RunAsync(invocation, ["report", "--format", "json"], AppContext.BaseDirectory, CancellationToken.None);

        Assert.Equal(0, result.ExitCode);
        var payload = WorkspecCostReportPayload.Parse(result.Stdout);

        Assert.Equal("costType", payload.Rollup.DimensionId);
        Assert.Equal(3, payload.Rollup.Buckets.Count);
        Assert.Contains(payload.Rollup.Buckets, b => b.Key == "compute" && b.Amount == 300);

        var coverage = Assert.Single(payload.Coverage);
        Assert.True(coverage.IsPrimary);
        Assert.Equal("costType", coverage.DimensionId);
        Assert.Equal(1, coverage.UnattributedCount);

        Assert.Equal(1100, payload.Totals.InventorySpend);
        Assert.Contains("USD", payload.Totals.Currencies);
    }

    [Fact]
    public async Task Parse_WithMalformedJsonFixture_ThrowsJsonException()
    {
        var invocation = new WorkspecCliInvocation(Path.Combine(FixturesDirectory, "fake-workspec-cost-malformed.sh"));

        var result = await WorkspecCliRunner.RunAsync(invocation, ["report", "--format", "json"], AppContext.BaseDirectory, CancellationToken.None);

        Assert.Equal(0, result.ExitCode);
        Assert.Throws<JsonException>(() => WorkspecCostReportPayload.Parse(result.Stdout));
    }
}
