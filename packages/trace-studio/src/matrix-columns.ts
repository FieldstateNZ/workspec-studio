// The RTM's column order + header labels, shared by all three format
// serializers (markdown/csv/html) so they can't drift apart on naming or
// ordering — a header change here changes every format at once.

import type { MatrixRow } from './matrix-row.types.js';

/** One RTM column: the `MatrixRow` field it reads, and its rendered header label. */
export interface MatrixColumn {
  readonly key: keyof MatrixRow;
  readonly label: string;
}

/**
 * The RTM's seven columns, in the order every renderer prints them (spec
 * §5/§6): Feature -> Rule -> Scenario -> Verifies -> Status -> Run -> SHA.
 */
export const MATRIX_COLUMNS: readonly MatrixColumn[] = [
  { key: 'feature', label: 'Feature' },
  { key: 'rule', label: 'Rule' },
  { key: 'scenario', label: 'Scenario' },
  { key: 'verifies', label: 'Verifies' },
  { key: 'status', label: 'Status' },
  { key: 'run', label: 'Run' },
  { key: 'sha', label: 'SHA' },
];
