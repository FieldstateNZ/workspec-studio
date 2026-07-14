using System.Text.Json;
using Aspire.Hosting;
using Aspire.Hosting.Workspec;

namespace Aspire.Hosting.Workspec.Tests;

public class WorkspecCostCliRunnerTests
{
    private static readonly string FixturesDirectory = Path.Combine(AppContext.BaseDirectory, "Fixtures");

    [Fact]
    public async Task RunAsync_WithCleanValidateFixture_ReturnsExitZeroAndEmptyDiagnosticsArray()
    {
        var invocation = new WorkspecCliInvocation(Path.Combine(FixturesDirectory, "fake-workspec-cost-validate-clean.sh"));

        var result = await WorkspecCostCliRunner.RunAsync(invocation, ["validate", "--json"], AppContext.BaseDirectory, CancellationToken.None);

        Assert.Equal(0, result.ExitCode);
        var diagnostics = WorkspecCostCliRunner.ParseDiagnostics(result.Stdout);
        Assert.Empty(diagnostics);
    }

    [Fact]
    public async Task RunAsync_WithValidateErrorsFixture_ReturnsExitOneAndParsedDiagnostics()
    {
        var invocation = new WorkspecCliInvocation(Path.Combine(FixturesDirectory, "fake-workspec-cost-validate-errors.sh"));

        var result = await WorkspecCostCliRunner.RunAsync(invocation, ["validate", "--json"], AppContext.BaseDirectory, CancellationToken.None);

        Assert.Equal(1, result.ExitCode);
        var diagnostics = WorkspecCostCliRunner.ParseDiagnostics(result.Stdout);
        Assert.Collection(
            diagnostics,
            first =>
            {
                Assert.Equal("error", first.Severity);
                Assert.Equal("parse-error", first.Code);
                Assert.Equal("estate.inventory.yaml", first.File);
                Assert.Equal(4, first.Line);
                Assert.Equal(3, first.Col);
            },
            second =>
            {
                Assert.Equal("warning", second.Severity);
                Assert.Equal("mixed-currency", second.Code);
                Assert.Equal("estate.attribution.yaml", second.File);
                Assert.Null(second.Line);
            });
    }

    [Fact]
    public async Task RunAsync_WithMalformedJsonFixture_ParseDiagnosticsThrowsJsonException()
    {
        var invocation = new WorkspecCliInvocation(Path.Combine(FixturesDirectory, "fake-workspec-cost-malformed.sh"));

        var result = await WorkspecCostCliRunner.RunAsync(invocation, ["validate", "--json"], AppContext.BaseDirectory, CancellationToken.None);

        Assert.Equal(0, result.ExitCode);
        Assert.Throws<JsonException>(() => WorkspecCostCliRunner.ParseDiagnostics(result.Stdout));
    }

    [Fact]
    public async Task RunAsync_WithReportOkFixture_ParsesRollupCoverageAndTotals()
    {
        var invocation = new WorkspecCliInvocation(Path.Combine(FixturesDirectory, "fake-workspec-cost-report-ok.sh"));

        var result = await WorkspecCostCliRunner.RunAsync(invocation, ["report", "--format", "json"], AppContext.BaseDirectory, CancellationToken.None);

        Assert.Equal(0, result.ExitCode);
        var payload = WorkspecCostCliRunner.ParseReportPayload(result.Stdout);

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
    public async Task RunAsync_WithMalformedJsonFixture_ParseReportPayloadThrowsJsonException()
    {
        var invocation = new WorkspecCliInvocation(Path.Combine(FixturesDirectory, "fake-workspec-cost-malformed.sh"));

        var result = await WorkspecCostCliRunner.RunAsync(invocation, ["report", "--format", "json"], AppContext.BaseDirectory, CancellationToken.None);

        Assert.Equal(0, result.ExitCode);
        Assert.Throws<JsonException>(() => WorkspecCostCliRunner.ParseReportPayload(result.Stdout));
    }

    [Fact]
    public async Task RunAsync_WithStocktakeOkFixture_ReturnsExitZeroAndStderrLines()
    {
        var invocation = new WorkspecCliInvocation(Path.Combine(FixturesDirectory, "fake-workspec-cost-stocktake-ok.sh"));

        var result = await WorkspecCostCliRunner.RunAsync(invocation, ["stocktake", "--subscription", "sub-1"], AppContext.BaseDirectory, CancellationToken.None);

        Assert.Equal(0, result.ExitCode);
        Assert.Contains("wrote estate.inventory.yaml", result.Stderr);
    }

    [Fact]
    public async Task RunAsync_WithStocktakeFailFixture_ReturnsExitTwoAndStderrMessage()
    {
        var invocation = new WorkspecCliInvocation(Path.Combine(FixturesDirectory, "fake-workspec-cost-stocktake-fail.sh"));

        var result = await WorkspecCostCliRunner.RunAsync(invocation, ["stocktake"], AppContext.BaseDirectory, CancellationToken.None);

        Assert.Equal(2, result.ExitCode);
        Assert.Contains("invalid --name", result.Stderr);
    }

    [Fact]
    public async Task RunAsync_WithMissingCli_DegradesToSynthesizedFailure_NeverThrows()
    {
        var missingPath = Path.Combine(AppContext.BaseDirectory, "definitely-does-not-exist", "workspec-cost-nope");
        var invocation = new WorkspecCliInvocation(missingPath);

        var result = await WorkspecCostCliRunner.RunAsync(invocation, ["validate", "--json"], AppContext.BaseDirectory, CancellationToken.None);

        Assert.Equal(-1, result.ExitCode);
        Assert.Empty(result.Stdout);
        Assert.Contains(missingPath, result.Stderr);
    }

    // Regression: a dashboard command runs on user demand, not during apphost startup, but a hung
    // CLI (e.g. a stocktake stuck on a network call) must still resolve to a clean failure rather
    // than hang the command forever. The runner must kill the process tree and degrade.
    [Fact]
    public async Task RunAsync_WithHangingCli_KillsProcessTreeAndDegradesAfterTimeout()
    {
        var invocation = new WorkspecCliInvocation(Path.Combine(FixturesDirectory, "fake-workspec-cost-hang.sh"));
        var stopwatch = System.Diagnostics.Stopwatch.StartNew();

        var result = await WorkspecCostCliRunner.RunAsync(
            invocation,
            ["stocktake", "--subscription", "sub-1"],
            AppContext.BaseDirectory,
            CancellationToken.None,
            timeout: TimeSpan.FromSeconds(2));

        stopwatch.Stop();
        Assert.Equal(-1, result.ExitCode);
        Assert.Contains("timed out", result.Stderr);
        Assert.True(stopwatch.Elapsed < TimeSpan.FromSeconds(30), $"Expected a prompt timeout kill, took {stopwatch.Elapsed}.");
    }
}
