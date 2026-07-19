// Shared `Finding` construction: the omit-absent-optionals builder every
// derivation module uses, and the total order the final findings array is
// sorted into (spec §4.7: findings are data, deterministically ordered, so
// golden snapshots stay byte-stable / CI-diffable).

import type { Finding, FindingKind, FindingSeverity } from './types.js';
import { byString } from './ordering.js';

/** The fields a `Finding` may carry — optionals as explicit `| undefined` so callers can pass through absent values without tripping `exactOptionalPropertyTypes`. */
export interface FindingInput {
  kind: FindingKind;
  severity: FindingSeverity;
  message: string;
  file: string;
  line?: number | undefined;
  slug?: string | undefined;
  ref?: string | undefined;
  field?: string | undefined;
}

/** Build a `Finding`, omitting (rather than setting to `undefined`) absent optional fields. */
export function makeFinding(input: FindingInput): Finding {
  return {
    kind: input.kind,
    severity: input.severity,
    message: input.message,
    file: input.file,
    ...(input.line !== undefined ? { line: input.line } : {}),
    ...(input.slug !== undefined ? { slug: input.slug } : {}),
    ...(input.ref !== undefined ? { ref: input.ref } : {}),
    ...(input.field !== undefined ? { field: input.field } : {}),
  };
}

/** Total order over findings so the array is byte-stable / CI-diffable. */
export function compareFindings(a: Finding, b: Finding): number {
  return (
    byString(a.file, b.file) ||
    (a.line ?? 0) - (b.line ?? 0) ||
    byString(a.kind, b.kind) ||
    byString(a.slug ?? '', b.slug ?? '') ||
    byString(a.field ?? '', b.field ?? '') ||
    byString(a.ref ?? '', b.ref ?? '') ||
    byString(a.message, b.message)
  );
}
