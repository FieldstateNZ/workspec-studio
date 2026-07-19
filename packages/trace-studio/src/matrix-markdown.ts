// Renders `MatrixRow[]` (the RTM projection, spec §5/§6) as a GitHub-flavoured
// Markdown table. Pure string formatting — no IO, no clock — so identical
// rows yield an identical string every time (the `matrix` export's
// byte-determinism bar).

import { MATRIX_COLUMNS } from './matrix-columns.js';
import type { MatrixRow } from './matrix-row.types.js';

/**
 * Escape one Markdown table cell: a literal backslash must be escaped FIRST
 * (so escaping the pipe next can't collide with a backslash already in the
 * text), then the pipe itself (the column delimiter — spec's escaping bar),
 * then any embedded newline (a raw newline would otherwise break the table's
 * one-row-per-line structure) folded to a `<br>`.
 */
function escapeMarkdownCell(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\r\n|\r|\n/g, '<br>');
}

/** Render the RTM as a Markdown table: a header row, a divider row, then one row per `MatrixRow`. */
export function renderMatrixMarkdown(rows: readonly MatrixRow[]): string {
  const header = `| ${MATRIX_COLUMNS.map((c) => c.label).join(' | ')} |`;
  const divider = `| ${MATRIX_COLUMNS.map(() => '---').join(' | ')} |`;
  const body = rows.map(
    (row) => `| ${MATRIX_COLUMNS.map((c) => escapeMarkdownCell(row[c.key])).join(' | ')} |`,
  );
  return [header, divider, ...body].join('\n') + '\n';
}
