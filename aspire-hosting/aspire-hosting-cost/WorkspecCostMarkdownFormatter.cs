using System.Globalization;
using System.Text;

namespace Aspire.Hosting;

/// <summary>
/// Builds the Markdown result payloads for the workspec-cost dashboard commands. Purely internal
/// plumbing — factored out of the command delegates in <see cref="WorkspecCostExtensions"/> so it's
/// directly unit-testable without a real (or fake) CLI process.
/// </summary>
internal static class WorkspecCostMarkdownFormatter
{
    /// <summary>Builds the Markdown result payload for the "Validate" dashboard command: a summary line plus a diagnostics table.</summary>
    public static string FormatValidateMarkdown(IReadOnlyList<WorkspecCostDiagnostic> diagnostics)
    {
        ArgumentNullException.ThrowIfNull(diagnostics);

        if (diagnostics.Count == 0)
        {
            return "No diagnostics — every cost artifact under the directory is clean.";
        }

        var errorCount = diagnostics.Count(d => d.Severity == "error");
        var warningCount = diagnostics.Count - errorCount;

        var markdown = new StringBuilder();
        markdown.Append(errorCount).Append(" error(s), ").Append(warningCount).Append(" warning(s).\n\n");
        markdown.Append("| severity | code | file | message |\n");
        markdown.Append("| --- | --- | --- | --- |\n");

        foreach (var diagnostic in diagnostics)
        {
            markdown.Append("| ").Append(EscapeTableCell(diagnostic.Severity))
                .Append(" | ").Append(EscapeTableCell(diagnostic.Code))
                .Append(" | ").Append(EscapeTableCell(diagnostic.File))
                .Append(" | ").Append(EscapeTableCell(diagnostic.Message))
                .Append(" |\n");
        }

        return markdown.ToString();
    }

    /// <summary>
    /// Builds the Markdown result payload for the "Report" dashboard command: a coverage headline
    /// plus a rollup table, re-deriving the same sorted (amount descending, "unattributed" last)
    /// presentation order <c>workspec-cost report</c>'s own <c>--format table</c> uses — the JSON
    /// payload's <c>rollup.buckets</c> array order is not itself a sorted/documented contract.
    /// </summary>
    public static string FormatReportMarkdown(WorkspecCostReportPayload payload)
    {
        ArgumentNullException.ThrowIfNull(payload);

        var markdown = new StringBuilder();

        var primaryCoverage = payload.Coverage.FirstOrDefault(c => c.IsPrimary && c.DimensionId == payload.Rollup.DimensionId)
            ?? payload.Coverage.FirstOrDefault(c => c.DimensionId == payload.Rollup.DimensionId);

        if (primaryCoverage is not null)
        {
            var pct = (primaryCoverage.Ratio * 100).ToString("F1", CultureInfo.InvariantCulture);
            markdown.Append("coverage[").Append(payload.Rollup.DimensionId).Append("] ").Append(pct)
                .Append("% · $").Append(FormatMoney(primaryCoverage.UnattributedSpend))
                .Append("/mo unattributed · ").Append(primaryCoverage.UnattributedCount).Append(" resource(s)\n\n");
        }

        var unattributed = payload.Rollup.Buckets.FirstOrDefault(b => b.Key == "unattributed");
        var rest = payload.Rollup.Buckets
            .Where(b => b.Key != "unattributed")
            .OrderByDescending(b => b.Amount)
            .ThenBy(b => b.Key, StringComparer.Ordinal);
        var ordered = unattributed is null ? rest : rest.Append(unattributed);

        markdown.Append("| ").Append(EscapeTableCell(payload.Rollup.DimensionId)).Append(" | $/mo | share% |\n");
        markdown.Append("| --- | ---: | ---: |\n");

        var totalSpend = payload.Totals.InventorySpend;
        foreach (var bucket in ordered)
        {
            var share = totalSpend != 0 ? bucket.Amount / totalSpend * 100 : 0;
            markdown.Append("| ").Append(EscapeTableCell(bucket.Key))
                .Append(" | ").Append(FormatMoney(bucket.Amount))
                .Append(" | ").Append(share.ToString("F1", CultureInfo.InvariantCulture)).Append("% |\n");
        }

        return markdown.ToString();
    }

    private static string FormatMoney(double amount) => Math.Round(amount).ToString("N0", CultureInfo.InvariantCulture);

    // Every cell is CLI-provided (or dimension-id-derived) text; a literal '|' in any of them would
    // break the table row.
    private static string EscapeTableCell(string value) => value.Replace("|", "\\|", StringComparison.Ordinal);
}
