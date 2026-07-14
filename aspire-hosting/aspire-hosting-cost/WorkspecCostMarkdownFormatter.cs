using System.Globalization;
using System.Text;
using Aspire.Hosting.Workspec;

namespace Aspire.Hosting;

/// <summary>
/// Builds the Markdown result payloads for the workspec-cost dashboard commands. Purely internal
/// plumbing — factored out of the command delegates in <see cref="WorkspecCostExtensions"/> so it's
/// directly unit-testable without a real (or fake) CLI process. "Validate"'s table itself is now a
/// thin wrapper over <see cref="WorkspecCliRunner.FormatValidateMarkdown"/> (Core, A6 #39) with this
/// module's own clean-diagnostics message; "Report" has no equivalent in any other module
/// integration, so it stays here.
/// </summary>
internal static class WorkspecCostMarkdownFormatter
{
    /// <summary>Builds the Markdown result payload for the "Validate" dashboard command: a summary line plus a diagnostics table.</summary>
    public static string FormatValidateMarkdown(IReadOnlyList<WorkspecCliDiagnostic> diagnostics) =>
        WorkspecCliRunner.FormatValidateMarkdown(diagnostics, "No diagnostics — every cost artifact under the directory is clean.");

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

        markdown.Append("| ").Append(WorkspecCliRunner.EscapeTableCell(payload.Rollup.DimensionId)).Append(" | $/mo | share% |\n");
        markdown.Append("| --- | ---: | ---: |\n");

        var totalSpend = payload.Totals.InventorySpend;
        foreach (var bucket in ordered)
        {
            var share = totalSpend != 0 ? bucket.Amount / totalSpend * 100 : 0;
            markdown.Append("| ").Append(WorkspecCliRunner.EscapeTableCell(bucket.Key))
                .Append(" | ").Append(FormatMoney(bucket.Amount))
                .Append(" | ").Append(share.ToString("F1", CultureInfo.InvariantCulture)).Append("% |\n");
        }

        return markdown.ToString();
    }

    private static string FormatMoney(double amount) => Math.Round(amount).ToString("N0", CultureInfo.InvariantCulture);
}
