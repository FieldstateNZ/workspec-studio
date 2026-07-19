// Renders `MatrixRow[]` (the RTM projection, spec §5/§6) as CSV. Pure string
// formatting — no IO, no clock — so identical rows yield an identical string
// every time (the `matrix` export's byte-determinism bar). Line endings are
// `\n` throughout (matching the markdown/html renderers), which every CSV
// reader this artifact targets (spreadsheets, `csv-parse`-style libraries)
// accepts despite RFC 4180 nominally specifying CRLF.

import { MATRIX_COLUMNS } from './matrix-columns.js';
import type { MatrixRow } from './matrix-row.types.js';

/** RFC 4180 quoting: a field is quoted, with embedded quotes doubled, iff it contains a comma, quote, or newline. */
function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Render the RTM as CSV: a header row, then one row per `MatrixRow`, in the shared `MATRIX_COLUMNS` order. */
export function renderMatrixCsv(rows: readonly MatrixRow[]): string {
  const header = MATRIX_COLUMNS.map((c) => escapeCsvField(c.label)).join(',');
  const body = rows.map((row) => MATRIX_COLUMNS.map((c) => escapeCsvField(row[c.key])).join(','));
  return [header, ...body].join('\n') + '\n';
}
