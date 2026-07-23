// Renders a computed report (`report-core.ts`'s `ReportOk`) to table/json/csv
// text. Shared by the CLI's `report` command and the `cost_report` MCP tool
// so the exact table/CSV formatting can't drift between the two surfaces —
// only `renderReport`'s caller decides what to do with an unknown `--format`
// (the CLI turns it into exit code 2; the MCP tool turns it into `isError`).

import type { AttributeResult, Coverage, Rollup } from '@workspec/cost-engine';

interface RollupRow {
  readonly key: string;
  readonly amount: number;
  readonly share: number;
}

function formatMoney(amount: number): string {
  return Math.round(amount).toLocaleString('en-US');
}

function rollupRows(rollup: Rollup, totalSpend: number): RollupRow[] {
  const unattributed = rollup.buckets.find((b) => b.key === 'unattributed');
  const rest = rollup.buckets
    .filter((b) => b.key !== 'unattributed')
    .sort((a, b) => (b.amount !== a.amount ? b.amount - a.amount : a.key < b.key ? -1 : 1));
  const ordered = unattributed !== undefined ? [...rest, unattributed] : rest;
  return ordered.map((b) => ({
    key: b.key,
    amount: b.amount,
    share: totalSpend !== 0 ? b.amount / totalSpend : 0,
  }));
}

function renderHeadline(coverage: Coverage): string {
  const pct = (coverage.ratio * 100).toFixed(1);
  return `coverage[${coverage.dimensionId}] ${pct}% · $${formatMoney(coverage.unattributedSpend)}/mo unattributed · ${coverage.unattributedCount} resources`;
}

function renderTable(dimensionLabel: string, rows: RollupRow[]): string {
  const amountStrs = rows.map((r) => formatMoney(r.amount));
  const shareStrs = rows.map((r) => `${(r.share * 100).toFixed(1)}%`);
  const keyWidth = Math.max(dimensionLabel.length, ...rows.map((r) => r.key.length));
  const amountWidth = Math.max('$/mo'.length, ...amountStrs.map((s) => s.length));
  const shareWidth = Math.max('share%'.length, ...shareStrs.map((s) => s.length));

  const lines = [
    `${dimensionLabel.padEnd(keyWidth)}  ${'$/mo'.padStart(amountWidth)}  ${'share%'.padStart(shareWidth)}`,
  ];
  rows.forEach((r, i) => {
    const amountStr = amountStrs[i] ?? '';
    const shareStr = shareStrs[i] ?? '';
    lines.push(`${r.key.padEnd(keyWidth)}  ${amountStr.padStart(amountWidth)}  ${shareStr.padStart(shareWidth)}`);
  });
  return `${lines.join('\n')}\n`;
}

function csvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function renderCsv(dimensionId: string, rows: RollupRow[]): string {
  const lines = ['dimension,value,amount,share'];
  for (const row of rows) {
    const amount = Math.round(row.amount * 100) / 100;
    const share = Math.round(row.share * 100 * 100) / 100;
    lines.push(`${csvField(dimensionId)},${csvField(row.key)},${amount},${share}`);
  }
  return `${lines.join('\n')}\n`;
}

/** Everything `renderReport` needs from a computed {@link import('./report-core.js').ReportOk}. */
export interface RenderReportInput {
  readonly dimensionId: string;
  readonly dimensionLabel: string;
  readonly primaryCoverage: Coverage;
  /** Every dimension's coverage — echoed verbatim in the "json" format, mirroring the CLI's historical output. */
  readonly coverage: readonly Coverage[];
  readonly rollup: Rollup;
  readonly totals: AttributeResult['totals'];
}

/** Either the rendered text, or a client-input problem (an unrecognized `format`). */
export type RenderedReport = { readonly text: string } | { readonly usageError: string };

/**
 * Renders `input` as `format` ("table" | "json" | "csv", default "table").
 * `format` is untyped input from a CLI flag or an MCP tool argument, so an
 * unrecognized value is a {@link RenderedReport} usage error, not a throw.
 */
export function renderReport(format: string | undefined, input: RenderReportInput): RenderedReport {
  const rows = rollupRows(input.rollup, input.totals.inventorySpend);
  switch (format ?? 'table') {
    case 'table':
      return { text: `${renderHeadline(input.primaryCoverage)}\n\n${renderTable(input.dimensionLabel, rows)}` };
    case 'json':
      return {
        text: `${JSON.stringify(
          { rollup: input.rollup, coverage: input.coverage, totals: input.totals },
          null,
          2,
        )}\n`,
      };
    case 'csv':
      return { text: renderCsv(input.dimensionId, rows) };
    default:
      return { usageError: `unknown --format "${format}" (expected table, json, or csv)` };
  }
}
