using Aspire.Hosting;
using Aspire.Hosting.Workspec;

namespace Aspire.Hosting.Workspec.Tests;

public class WorkspecC4CliRunnerTests
{
    private static readonly string FixturesDirectory = Path.Combine(AppContext.BaseDirectory, "Fixtures");

    [Fact]
    public async Task RunAsync_WithCleanFixture_ReturnsExitZeroAndEmptyDiagnosticsArray()
    {
        var invocation = new WorkspecCliInvocation(Path.Combine(FixturesDirectory, "fake-workspec-c4-clean.sh"));

        var result = await WorkspecC4CliRunner.RunAsync(invocation, ["validate", "--json"], AppContext.BaseDirectory, CancellationToken.None);

        Assert.Equal(0, result.ExitCode);
        var diagnostics = WorkspecC4CliRunner.ParseDiagnostics(result.Stdout);
        Assert.Empty(diagnostics);
    }

    [Fact]
    public async Task RunAsync_WithDriftFixture_ReturnsExitOneAndParsedDiagnostics()
    {
        var invocation = new WorkspecCliInvocation(Path.Combine(FixturesDirectory, "fake-workspec-c4-drift.sh"));

        var result = await WorkspecC4CliRunner.RunAsync(invocation, ["validate", "--json"], AppContext.BaseDirectory, CancellationToken.None);

        Assert.Equal(1, result.ExitCode);
        var diagnostics = WorkspecC4CliRunner.ParseDiagnostics(result.Stdout);
        Assert.Collection(
            diagnostics,
            first =>
            {
                Assert.Equal("error", first.Severity);
                Assert.Equal("element-missing", first.Code);
                Assert.Equal(".workspec/containers/api.yaml", first.File);
                Assert.Equal("api", first.Slug);
            },
            second =>
            {
                Assert.Equal("warning", second.Severity);
                Assert.Equal("field-drift", second.Code);
                Assert.Equal(".workspec/containers/cache.yaml", second.File);
                Assert.Equal("cache", second.Slug);
            });
    }

    [Fact]
    public async Task RunAsync_WithScaffoldFixture_ReturnsExitZeroAndStderrLines()
    {
        var invocation = new WorkspecCliInvocation(Path.Combine(FixturesDirectory, "fake-workspec-c4-scaffold.sh"));

        var result = await WorkspecC4CliRunner.RunAsync(invocation, ["import-aspire", "--mode", "scaffold"], AppContext.BaseDirectory, CancellationToken.None);

        Assert.Equal(0, result.ExitCode);
        Assert.Contains("wrote .workspec/containers/api.yaml", result.Stderr);
        Assert.Contains("wrote .workspec/containers/cache.yaml", result.Stderr);
    }

    [Fact]
    public async Task RunAsync_WithMissingCli_DegradesToSynthesizedFailure_NeverThrows()
    {
        var missingPath = Path.Combine(AppContext.BaseDirectory, "definitely-does-not-exist", "workspec-c4-nope");
        var invocation = new WorkspecCliInvocation(missingPath);

        var result = await WorkspecC4CliRunner.RunAsync(invocation, ["validate", "--json"], AppContext.BaseDirectory, CancellationToken.None);

        Assert.Equal(-1, result.ExitCode);
        Assert.Empty(result.Stdout);
        Assert.Contains(missingPath, result.Stderr);
    }

    // Regression: the graph-sync subscriber runs during apphost startup (AfterResourcesCreatedEvent
    // handlers are awaited sequentially), so a hung CLI without a timeout would stall the whole
    // apphost. The runner must kill the process tree and degrade — never hang, never throw.
    [Fact]
    public async Task RunAsync_WithHangingCli_KillsProcessTreeAndDegradesAfterTimeout()
    {
        var invocation = new WorkspecCliInvocation(Path.Combine(FixturesDirectory, "fake-workspec-c4-hang.sh"));
        var stopwatch = System.Diagnostics.Stopwatch.StartNew();

        var result = await WorkspecC4CliRunner.RunAsync(
            invocation,
            ["validate", "--json"],
            AppContext.BaseDirectory,
            CancellationToken.None,
            timeout: TimeSpan.FromSeconds(2));

        stopwatch.Stop();
        Assert.Equal(-1, result.ExitCode);
        Assert.Contains("timed out", result.Stderr);
        // The fixture sleeps 300s; returning quickly proves the kill actually happened rather than
        // the runner having waited the process out. Generous ceiling to stay unflaky under CI load.
        Assert.True(stopwatch.Elapsed < TimeSpan.FromSeconds(30), $"Expected a prompt timeout kill, took {stopwatch.Elapsed}.");
    }

    [Fact]
    public void FormatValidateMarkdown_WithNoDiagnostics_ReturnsCleanMessage()
    {
        var markdown = WorkspecC4CliRunner.FormatValidateMarkdown([]);

        Assert.Contains("No diagnostics", markdown);
    }

    // Every cell is CLI-provided text — a literal '|' in ANY column (not just message) must be
    // escaped or it splits the Markdown table row.
    [Fact]
    public void FormatValidateMarkdown_EscapesPipesInEveryColumn()
    {
        var diagnostics = new[]
        {
            new WorkspecCliDiagnostic("err|or", "element|missing", "message with | pipe", ".workspec/we|rd.yaml"),
        };

        var markdown = WorkspecC4CliRunner.FormatValidateMarkdown(diagnostics);

        Assert.Contains("err\\|or", markdown);
        Assert.Contains("element\\|missing", markdown);
        Assert.Contains("message with \\| pipe", markdown);
        Assert.Contains(".workspec/we\\|rd.yaml", markdown);
    }

    [Fact]
    public void FormatValidateMarkdown_WithOneError_ReportsCountAndDetails()
    {
        var diagnostics = new[]
        {
            new WorkspecCliDiagnostic("error", "element-missing", "Missing element for resource \"api\".", ".workspec/containers/api.yaml", "api"),
        };

        var markdown = WorkspecC4CliRunner.FormatValidateMarkdown(diagnostics);

        Assert.Contains("1 error(s)", markdown);
        Assert.Contains("0 warning(s)", markdown);
        Assert.Contains("element-missing", markdown);
        Assert.Contains(".workspec/containers/api.yaml", markdown);
        Assert.Contains("Missing element for resource", markdown);
    }

    [Fact]
    public void FormatValidateMarkdown_WithMixedSeverities_CountsEachSeverity()
    {
        var diagnostics = new[]
        {
            new WorkspecCliDiagnostic("error", "element-missing", "e1", "a.yaml"),
            new WorkspecCliDiagnostic("warning", "field-drift", "w1", "b.yaml"),
            new WorkspecCliDiagnostic("warning", "field-drift", "w2", "c.yaml"),
        };

        var markdown = WorkspecC4CliRunner.FormatValidateMarkdown(diagnostics);

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
