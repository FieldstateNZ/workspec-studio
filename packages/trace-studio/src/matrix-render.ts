// Dispatches a resolved `MatrixFormat` to its one true renderer, so the CLI
// (and any future embedder — spec §5's Matrix view export button) needn't
// know the three renderers' names, only the format.

import { renderMatrixCsv } from './matrix-csv.js';
import { renderMatrixHtml } from './matrix-html.js';
import { renderMatrixMarkdown } from './matrix-markdown.js';
import type { MatrixFormat } from './matrix-format.js';
import type { MatrixRow } from './matrix-row.types.js';

/** Render `rows` (the RTM projection) in the given export format (spec §6). */
export function renderMatrix(format: MatrixFormat, rows: readonly MatrixRow[]): string {
  switch (format) {
    case 'md':
      return renderMatrixMarkdown(rows);
    case 'csv':
      return renderMatrixCsv(rows);
    case 'html':
      return renderMatrixHtml(rows);
  }
}
