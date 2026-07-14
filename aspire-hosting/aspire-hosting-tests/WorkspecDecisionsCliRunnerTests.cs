using Aspire.Hosting;
using Aspire.Hosting.Workspec;

namespace Aspire.Hosting.Workspec.Tests;

public class WorkspecDecisionsCliRunnerTests
{
    private static readonly string FixturesDirectory = Path.Combine(AppContext.BaseDirectory, "Fixtures");

    [Fact]
    public async Task RunAsync_WithCleanFixture_ReturnsExitZeroAndEmptyDiagnosticsArray()
    {
        var invocation = new WorkspecCliInvocation(Path.Combine(FixturesDirectory, "fake-workspec-decisions-clean.sh"));

        var result = await WorkspecDecisionsCliRunner.RunAsync(invocation, ["validate", "--json"], AppContext.BaseDirectory, CancellationToken.None);

        Assert.Equal(0, result.ExitCode);
        var diagnostics = WorkspecDecisionsCliRunner.ParseDiagnostics(result.Stdout);
        Assert.Empty(diagnostics);
    }

    [Fact]
    public async Task RunAsync_WithErrorsFixture_ReturnsExitOneAndParsedDiagnostics()
    {
        var invocation = new WorkspecCliInvocation(Path.Combine(FixturesDirectory, "fake-workspec-decisions-errors.sh"));

        var result = await WorkspecDecisionsCliRunner.RunAsync(invocation, ["validate", "--json"], AppContext.BaseDirectory, CancellationToken.None);

        Assert.Equal(1, result.ExitCode);
        var diagnostics = WorkspecDecisionsCliRunner.ParseDiagnostics(result.Stdout);
        Assert.Collection(
            diagnostics,
            first =>
            {
                Assert.Equal("error", first.Severity);
                Assert.Equal("dangling-sku-ref", first.Code);
                Assert.Equal("decisions/pick-db.decision.yaml", first.File);
                Assert.Equal(12, first.Line);
                Assert.Equal(5, first.Col);
            },
            second =>
            {
                Assert.Equal("warning", second.Severity);
                Assert.Equal("dangling-lever-catalogRef-ref", second.Code);
                Assert.Equal("decisions/pick-db.decision.yaml", second.File);
            });
    }

    [Fact]
    public async Task RunAsync_WithMissingCli_DegradesToSynthesizedFailure_NeverThrows()
    {
        var missingPath = Path.Combine(AppContext.BaseDirectory, "definitely-does-not-exist", "workspec-decisions-nope");
        var invocation = new WorkspecCliInvocation(missingPath);

        var result = await WorkspecDecisionsCliRunner.RunAsync(invocation, ["validate", "--json"], AppContext.BaseDirectory, CancellationToken.None);

        Assert.Equal(-1, result.ExitCode);
        Assert.Empty(result.Stdout);
        Assert.Contains(missingPath, result.Stderr);
    }

    // Regression: dashboard commands run synchronously from the user's perspective, so a hung CLI
    // without a timeout would wedge the command indefinitely. The runner must kill the process tree
    // and degrade — never hang, never throw. Same safety property as aspire-hosting-c4's
    // WorkspecC4CliRunner (see the TODO(A6, #39) consolidation note on this private internal copy).
    [Fact]
    public async Task RunAsync_WithHangingCli_KillsProcessTreeAndDegradesAfterTimeout()
    {
        var invocation = new WorkspecCliInvocation(Path.Combine(FixturesDirectory, "fake-workspec-decisions-hang.sh"));
        var stopwatch = System.Diagnostics.Stopwatch.StartNew();

        var result = await WorkspecDecisionsCliRunner.RunAsync(
            invocation,
            ["validate", "--json"],
            AppContext.BaseDirectory,
            CancellationToken.None,
            timeout: TimeSpan.FromSeconds(2));

        stopwatch.Stop();
        Assert.Equal(-1, result.ExitCode);
        Assert.Contains("timed out", result.Stderr);
        Assert.True(stopwatch.Elapsed < TimeSpan.FromSeconds(30), $"Expected a prompt timeout kill, took {stopwatch.Elapsed}.");
    }

    [Fact]
    public void FormatValidateMarkdown_WithNoDiagnostics_ReturnsCleanMessage()
    {
        var markdown = WorkspecDecisionsCliRunner.FormatValidateMarkdown([]);

        Assert.Contains("No diagnostics", markdown);
    }

    // Every cell is CLI-provided text — a literal '|' in ANY column must be escaped or it splits the
    // Markdown table row.
    [Fact]
    public void FormatValidateMarkdown_EscapesPipesInEveryColumn()
    {
        var diagnostics = new[]
        {
            new WorkspecDecisionsCliDiagnostic("err|or", "dangling|ref", "message with | pipe", "decisions/we|rd.decision.yaml"),
        };

        var markdown = WorkspecDecisionsCliRunner.FormatValidateMarkdown(diagnostics);

        Assert.Contains("err\\|or", markdown);
        Assert.Contains("dangling\\|ref", markdown);
        Assert.Contains("message with \\| pipe", markdown);
        Assert.Contains("decisions/we\\|rd.decision.yaml", markdown);
    }

    [Fact]
    public void FormatValidateMarkdown_WithOneError_ReportsCountAndDetails()
    {
        var diagnostics = new[]
        {
            new WorkspecDecisionsCliDiagnostic("error", "dangling-sku-ref", "Option \"cheap\" references unknown SKU.", "decisions/pick-db.decision.yaml", 12, 5),
        };

        var markdown = WorkspecDecisionsCliRunner.FormatValidateMarkdown(diagnostics);

        Assert.Contains("1 error(s)", markdown);
        Assert.Contains("0 warning(s)", markdown);
        Assert.Contains("dangling-sku-ref", markdown);
        Assert.Contains("decisions/pick-db.decision.yaml", markdown);
        Assert.Contains("Option \"cheap\"", markdown);
    }

    [Fact]
    public void FormatValidateMarkdown_WithMixedSeverities_CountsEachSeverity()
    {
        var diagnostics = new[]
        {
            new WorkspecDecisionsCliDiagnostic("error", "dangling-sku-ref", "e1", "a.decision.yaml"),
            new WorkspecDecisionsCliDiagnostic("warning", "dangling-lever-catalogRef-ref", "w1", "b.decision.yaml"),
            new WorkspecDecisionsCliDiagnostic("warning", "dangling-lever-catalogRef-ref", "w2", "c.decision.yaml"),
        };

        var markdown = WorkspecDecisionsCliRunner.FormatValidateMarkdown(diagnostics);

        Assert.Contains("1 error(s)", markdown);
        Assert.Contains("2 warning(s)", markdown);
        foreach (var d in diagnostics)
        {
            Assert.Contains(d.File, markdown);
            Assert.Contains(d.Code, markdown);
            Assert.Contains(d.Message, markdown);
        }
    }
}
