import type { DriftClass } from './drift.types.js';

/** Aggregate counts over a `Drift[]`, keyed by class. Every class is present, `0` when absent — never a missing key. */
export type DriftCountsByClass = Readonly<Record<DriftClass, number>>;

/**
 * Summary over a `reconcile()` result — enough for a CI gate to decide
 * pass/fail (`hasDrift`) or report per-class counts without re-scanning the
 * `Drift[]` itself.
 */
export interface DriftSummary {
  readonly countsByClass: DriftCountsByClass;
  readonly total: number;
  readonly hasDrift: boolean;
}
