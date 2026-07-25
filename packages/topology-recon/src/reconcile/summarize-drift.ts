import { DRIFT_CLASSES } from '../model/drift.types.js';
import type { Drift, DriftClass } from '../model/drift.types.js';
import type { DriftSummary } from '../model/drift-summary.types.js';

/**
 * Summarizes a `Drift[]` into per-class counts plus a `hasDrift` flag — a CI
 * gate can do `process.exitCode = summary.hasDrift ? 1 : 0` without
 * re-scanning the array. Every entry in `DRIFT_CLASSES` is always present in
 * `countsByClass`, at `0` when absent, so a consumer can destructure
 * (`{ phantom, orphan }`) without an existence check first.
 */
export function summarizeDrift(drifts: readonly Drift[]): DriftSummary {
  const countsByClass = Object.fromEntries(DRIFT_CLASSES.map((cls) => [cls, 0])) as Record<
    DriftClass,
    number
  >;
  for (const drift of drifts) countsByClass[drift.class] += 1;

  return {
    countsByClass,
    total: drifts.length,
    hasDrift: drifts.length > 0,
  };
}
