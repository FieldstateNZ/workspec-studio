using Aspire.Hosting;

namespace Aspire.Hosting.Workspec.Tests;

public class WorkspecCostMarkdownFormatterTests
{
    [Fact]
    public void FormatValidateMarkdown_WithNoDiagnostics_ReturnsCleanMessage()
    {
        var markdown = WorkspecCostMarkdownFormatter.FormatValidateMarkdown([]);

        Assert.Contains("No diagnostics", markdown);
    }

    [Fact]
    public void FormatValidateMarkdown_WithMixedSeverities_CountsEachSeverity()
    {
        var diagnostics = new[]
        {
            new WorkspecCostDiagnostic("error", "parse-error", "e1", "a.yaml"),
            new WorkspecCostDiagnostic("warning", "mixed-currency", "w1", "b.yaml"),
            new WorkspecCostDiagnostic("warning", "mixed-currency", "w2", "c.yaml"),
        };

        var markdown = WorkspecCostMarkdownFormatter.FormatValidateMarkdown(diagnostics);

        Assert.Contains("1 error(s)", markdown);
        Assert.Contains("2 warning(s)", markdown);
        foreach (var d in diagnostics)
        {
            Assert.Contains(d.File, markdown);
            Assert.Contains(d.Code, markdown);
            Assert.Contains(d.Message, markdown);
        }
    }

    // Every cell is CLI-provided text — a literal '|' in ANY column must be escaped or it splits
    // the Markdown table row.
    [Fact]
    public void FormatValidateMarkdown_EscapesPipesInEveryColumn()
    {
        var diagnostics = new[]
        {
            new WorkspecCostDiagnostic("err|or", "code|x", "message with | pipe", "file|name.yaml"),
        };

        var markdown = WorkspecCostMarkdownFormatter.FormatValidateMarkdown(diagnostics);

        Assert.Contains("err\\|or", markdown);
        Assert.Contains("code\\|x", markdown);
        Assert.Contains("message with \\| pipe", markdown);
        Assert.Contains("file\\|name.yaml", markdown);
    }

    [Fact]
    public void FormatReportMarkdown_RendersHeadlineAndSortedTableWithUnattributedLast()
    {
        var payload = new WorkspecCostReportPayload(
            new WorkspecCostRollup("costType", [
                new WorkspecCostRollupBucket("compute", 300),
                new WorkspecCostRollupBucket("storage", 700),
                new WorkspecCostRollupBucket("unattributed", 100),
            ]),
            [new WorkspecCostCoverage("costType", true, 1000, 100, 1000d / 1100, 1, 1100)],
            new WorkspecCostTotals(1100, 1100, 0, 0, 0, ["USD"]));

        var markdown = WorkspecCostMarkdownFormatter.FormatReportMarkdown(payload);

        Assert.Contains("coverage[costType]", markdown);
        Assert.Contains("90.9%", markdown);
        Assert.Contains("$100/mo unattributed", markdown);
        Assert.Contains("1 resource(s)", markdown);

        // Sorted amount descending, "unattributed" forced last regardless of amount. Searched from
        // the table header onward — the headline above it also contains the word "unattributed"
        // ("$100/mo unattributed"), which isn't the row order this asserts.
        var tableStart = markdown.IndexOf("| costType |", StringComparison.Ordinal);
        Assert.True(tableStart >= 0, "Expected to find the rollup table header.");
        var table = markdown[tableStart..];
        var storageIndex = table.IndexOf("storage", StringComparison.Ordinal);
        var computeIndex = table.IndexOf("compute", StringComparison.Ordinal);
        var unattributedIndex = table.IndexOf("unattributed", StringComparison.Ordinal);
        Assert.True(storageIndex < computeIndex);
        Assert.True(computeIndex < unattributedIndex);
    }

    [Fact]
    public void FormatReportMarkdown_WithZeroInventorySpend_DoesNotDivideByZero()
    {
        var payload = new WorkspecCostReportPayload(
            new WorkspecCostRollup("costType", [new WorkspecCostRollupBucket("unattributed", 0)]),
            [new WorkspecCostCoverage("costType", true, 0, 0, 1, 0, 0)],
            new WorkspecCostTotals(0, 0, 0, 0, 0, []));

        var markdown = WorkspecCostMarkdownFormatter.FormatReportMarkdown(payload);

        Assert.Contains("0.0%", markdown);
    }

    [Fact]
    public void FormatReportMarkdown_EscapesPipesInBucketKeys()
    {
        var payload = new WorkspecCostReportPayload(
            new WorkspecCostRollup("cost|Type", [new WorkspecCostRollupBucket("team|a", 100)]),
            [],
            new WorkspecCostTotals(100, 100, 0, 0, 0, ["USD"]));

        var markdown = WorkspecCostMarkdownFormatter.FormatReportMarkdown(payload);

        Assert.Contains("cost\\|Type", markdown);
        Assert.Contains("team\\|a", markdown);
    }
}
