// Renders `MatrixRow[]` (the RTM projection, spec §5/§6) as a self-contained
// HTML document: inline `<style>`, no external stylesheet/script/font
// references, so the file opens standalone in a browser straight off disk —
// the auditor handed `matrix.html` needs nothing else. Pure string
// formatting — no IO, no clock — so identical rows yield an identical string
// every time (the `matrix` export's byte-determinism bar).

import { MATRIX_COLUMNS } from './matrix-columns.js';
import type { MatrixRow } from './matrix-row.types.js';

/** Escape the four characters spec's HTML escaping bar names, so authored content can never break the markup. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const STYLE = `
  :root { color-scheme: light dark; }
  body { font-family: system-ui, -apple-system, sans-serif; margin: 2rem; color: #1a1a1a; }
  h1 { font-size: 1.25rem; margin-bottom: 1rem; }
  table { border-collapse: collapse; width: 100%; font-size: 0.9rem; }
  th, td { border: 1px solid #999; padding: 0.4rem 0.6rem; text-align: left; vertical-align: top; }
  th { background: #eee; }
  tr:nth-child(even) td { background: #fafafa; }
  .status-pass { color: #0a7a2f; font-weight: 600; }
  .status-fail { color: #b3261e; font-weight: 600; }
  .status-skip { color: #8a6d00; font-weight: 600; }
  .status-unproven { color: #666; font-style: italic; }
  @media (prefers-color-scheme: dark) {
    body { background: #1a1a1a; color: #eee; }
    th { background: #2a2a2a; }
    tr:nth-child(even) td { background: #222; }
    th, td { border-color: #444; }
  }
`.trim();

/** Render one `MatrixRow` as a `<tr>`, tagging the Status cell with a `status-<value>` class for the stylesheet above. */
function renderRow(row: MatrixRow): string {
  const cells = MATRIX_COLUMNS.map((c) => {
    const value = escapeHtml(row[c.key]);
    return c.key === 'status' ? `<td class="status-${value}">${value}</td>` : `<td>${value}</td>`;
  }).join('');
  return `<tr>${cells}</tr>`;
}

/** Render the RTM as a self-contained HTML document: inline CSS, one `<table>` row per `MatrixRow`. */
export function renderMatrixHtml(rows: readonly MatrixRow[]): string {
  const headCells = MATRIX_COLUMNS.map((c) => `<th>${escapeHtml(c.label)}</th>`).join('');
  const bodyRows = rows.map(renderRow).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Requirements Traceability Matrix</title>
<style>
${STYLE}
</style>
</head>
<body>
<h1>Requirements Traceability Matrix</h1>
<table>
<thead>
<tr>${headCells}</tr>
</thead>
<tbody>
${bodyRows}
</tbody>
</table>
</body>
</html>
`;
}
