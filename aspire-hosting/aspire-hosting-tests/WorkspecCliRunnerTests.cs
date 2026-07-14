using System.Text.Json;
using Aspire.Hosting;
using Aspire.Hosting.Workspec;

namespace Aspire.Hosting.Workspec.Tests;

/// <summary>
/// Tests for <see cref="WorkspecCliRunner"/> and <see cref="WorkspecCliDiagnostic"/> — the shared
/// process-execution/diagnostics-formatting primitives promoted into
/// <c>Aspire.Hosting.Workspec.Core</c> (A6, #39) from three byte-identical private copies
/// (<c>WorkspecC4CliRunner</c>, <c>WorkspecDecisionsCliRunner</c>, <c>WorkspecCostCliRunner</c>), each
/// of which previously carried its own copy of this exact test suite. Fixture scripts are borrowed
/// from whichever module happens to have a representative one on disk — <see cref="WorkspecCliRunner.RunAsync"/>
/// itself has no module-specific behavior, so which fixture proves a given process-execution property
/// is incidental. Module-specific behavior (command wiring, clean-diagnostics message text, discovery
/// fallback logic, etc.) stays covered by each module's own extensions/commands test file.
/// </summary>
public class WorkspecCliRunnerTests
{
    private static readonly string FixturesDirectory = Path.Combine(AppContext.BaseDirectory, "Fixtures");

    [Fact]
    public async Task RunAsync_WithCleanFixture_ReturnsExitZeroAndEmptyDiagnosticsArray()
    {
        var invocation = new WorkspecCliInvocation(Path.Combine(FixturesDirectory, "fake-workspec-c4-clean.sh"));

        var result = await WorkspecCliRunner.RunAsync(invocation, ["validate", "--json"], AppContext.BaseDirectory, CancellationToken.None);

        Assert.Equal(0, result.ExitCode);
        var diagnostics = WorkspecCliRunner.ParseDiagnostics(result.Stdout);
        Assert.Empty(diagnostics);
    }

    // Also exercises WorkspecCliDiagnostic.Slug, which only workspec-c4 ever populates.
    [Fact]
    public async Task RunAsync_WithDriftFixture_ReturnsExitOneAndParsedDiagnosticsIncludingSlug()
    {
        var invocation = new WorkspecCliInvocation(Path.Combine(FixturesDirectory, "fake-workspec-c4-drift.sh"));

        var result = await WorkspecCliRunner.RunAsync(invocation, ["validate", "--json"], AppContext.BaseDirectory, CancellationToken.None);

        Assert.Equal(1, result.ExitCode);
        var diagnostics = WorkspecCliRunner.ParseDiagnostics(result.Stdout);
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

    // workspec-decisions/workspec-cost diagnostics never emit `slug` — proves the shared type
    // (unified across all three modules, A6 #39) tolerates the absent property (deserializes to
    // null) rather than requiring it.
    [Fact]
    public async Task RunAsync_WithFixtureLackingSlug_ParsesLineAndColWithNullSlug()
    {
        var invocation = new WorkspecCliInvocation(Path.Combine(FixturesDirectory, "fake-workspec-decisions-errors.sh"));

        var result = await WorkspecCliRunner.RunAsync(invocation, ["validate", "--json"], AppContext.BaseDirectory, CancellationToken.None);

        Assert.Equal(1, result.ExitCode);
        var diagnostics = WorkspecCliRunner.ParseDiagnostics(result.Stdout);
        Assert.Collection(
            diagnostics,
            first =>
            {
                Assert.Equal("error", first.Severity);
                Assert.Equal("dangling-sku-ref", first.Code);
                Assert.Null(first.Slug);
                Assert.Equal(12, first.Line);
                Assert.Equal(5, first.Col);
            },
            second => Assert.Equal("warning", second.Severity));
    }

    [Fact]
    public async Task RunAsync_WithMalformedJsonFixture_ParseDiagnosticsThrowsJsonException()
    {
        var invocation = new WorkspecCliInvocation(Path.Combine(FixturesDirectory, "fake-workspec-cost-malformed.sh"));

        var result = await WorkspecCliRunner.RunAsync(invocation, ["validate", "--json"], AppContext.BaseDirectory, CancellationToken.None);

        Assert.Equal(0, result.ExitCode);
        Assert.Throws<JsonException>(() => WorkspecCliRunner.ParseDiagnostics(result.Stdout));
    }

    [Fact]
    public async Task RunAsync_WithScaffoldFixture_ReturnsExitZeroAndStderrLines()
    {
        var invocation = new WorkspecCliInvocation(Path.Combine(FixturesDirectory, "fake-workspec-c4-scaffold.sh"));

        var result = await WorkspecCliRunner.RunAsync(invocation, ["import-aspire", "--mode", "scaffold"], AppContext.BaseDirectory, CancellationToken.None);

        Assert.Equal(0, result.ExitCode);
        Assert.Contains("wrote .workspec/containers/api.yaml", result.Stderr);
        Assert.Contains("wrote .workspec/containers/cache.yaml", result.Stderr);
    }

    [Fact]
    public async Task RunAsync_WithMissingCli_DegradesToSynthesizedFailure_NeverThrows()
    {
        var missingPath = Path.Combine(AppContext.BaseDirectory, "definitely-does-not-exist", "workspec-nope");
        var invocation = new WorkspecCliInvocation(missingPath);

        var result = await WorkspecCliRunner.RunAsync(invocation, ["validate", "--json"], AppContext.BaseDirectory, CancellationToken.None);

        Assert.Equal(-1, result.ExitCode);
        Assert.Empty(result.Stdout);
        Assert.Contains(missingPath, result.Stderr);
    }

    // Regression: several callers (the c4 graph-sync subscriber runs during apphost startup; dashboard
    // commands run synchronously from the user's perspective) need a hung CLI to degrade rather than
    // hang or stall. The runner must kill the process tree and degrade — never hang, never throw.
    [Fact]
    public async Task RunAsync_WithHangingCli_KillsProcessTreeAndDegradesAfterTimeout()
    {
        var invocation = new WorkspecCliInvocation(Path.Combine(FixturesDirectory, "fake-workspec-c4-hang.sh"));
        var stopwatch = System.Diagnostics.Stopwatch.StartNew();

        var result = await WorkspecCliRunner.RunAsync(
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
    public void FormatValidateMarkdown_WithNoDiagnostics_ReturnsTheSuppliedCleanMessage()
    {
        var markdown = WorkspecCliRunner.FormatValidateMarkdown([], "No diagnostics — everything is clean.");

        Assert.Equal("No diagnostics — everything is clean.", markdown);
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

        var markdown = WorkspecCliRunner.FormatValidateMarkdown(diagnostics, "clean");

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

        var markdown = WorkspecCliRunner.FormatValidateMarkdown(diagnostics, "clean");

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

        var markdown = WorkspecCliRunner.FormatValidateMarkdown(diagnostics, "clean");

        Assert.Contains("1 error(s)", markdown);
        Assert.Contains("2 warning(s)", markdown);
        foreach (var d in diagnostics)
        {
            Assert.Contains(d.File, markdown);
            Assert.Contains(d.Code, markdown);
            Assert.Contains(d.Message, markdown);
        }
    }

    // Regression (A6, #39): the three private copies this was promoted from escaped '|' but not
    // newlines, and would NRE on a null field (possible via JSON deserialization even though the
    // record's properties are non-nullable `string` — System.Text.Json does not enforce nullable
    // reference type annotations at runtime).
    [Fact]
    public void EscapeTableCell_WithNull_ReturnsEmptyString_NeverThrows()
    {
        Assert.Equal(string.Empty, WorkspecCliRunner.EscapeTableCell(null));
    }

    [Fact]
    public void EscapeTableCell_WithEmpty_ReturnsEmptyString()
    {
        Assert.Equal(string.Empty, WorkspecCliRunner.EscapeTableCell(string.Empty));
    }

    [Theory]
    [InlineData("line one\nline two", "line one<br>line two")]
    [InlineData("crlf one\r\ncrlf two", "crlf one<br>crlf two")]
    [InlineData("lone cr\rafter", "lone cr<br>after")]
    public void EscapeTableCell_EscapesNewlinesOfEveryFlavor(string input, string expected)
    {
        Assert.Equal(expected, WorkspecCliRunner.EscapeTableCell(input));
    }

    [Fact]
    public void FormatValidateMarkdown_WithNullMessageField_DoesNotThrow_AndRendersEmptyCell()
    {
        // Simulates a CLI emitting a JSON `null` for a documented-non-nullable field — the
        // null-forgiving operator stands in for what System.Text.Json would actually produce.
        var diagnostics = new[]
        {
            new WorkspecCliDiagnostic("error", "some-code", null!, "a.yaml"),
        };

        var markdown = WorkspecCliRunner.FormatValidateMarkdown(diagnostics, "clean");

        // Column order is severity | code | file | message — File ("a.yaml") is populated, the null
        // Message field renders as an empty cell rather than throwing.
        Assert.Contains("| error | some-code | a.yaml |  |", markdown.Replace("\n", " ").Replace("\r", ""));
    }

    [Fact]
    public void FormatValidateMarkdown_WithNewlineInMessage_KeepsTableToOneRowPerDiagnostic()
    {
        var diagnostics = new[]
        {
            new WorkspecCliDiagnostic("error", "code-a", "line one\nline two", "a.yaml"),
            new WorkspecCliDiagnostic("warning", "code-b", "clean second row", "b.yaml"),
        };

        var markdown = WorkspecCliRunner.FormatValidateMarkdown(diagnostics, "clean");

        // Header + separator + exactly one row per diagnostic — a raw embedded newline would split
        // the first diagnostic across two lines instead.
        var lines = markdown.TrimEnd('\n').Split('\n');
        var tableLines = lines.Where(l => l.StartsWith('|')).ToList();
        Assert.Equal(4, tableLines.Count); // header, separator, 2 diagnostic rows
        Assert.Contains("line one<br>line two", tableLines[2]);
    }
}
