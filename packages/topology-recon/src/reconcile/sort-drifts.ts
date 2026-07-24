import { DRIFT_CLASSES } from '../model/drift.types.js';
import type { Drift } from '../model/drift.types.js';

function primarySlug(drift: Drift): string {
  switch (drift.class) {
    case 'phantom':
    case 'orphan':
      return drift.slug;
    case 'divergent':
      return drift.authoredSlug;
    case 'miswired':
      return drift.slugs[0] ?? '';
  }
}

/**
 * Orders a `Drift[]` deterministically: by class (`phantom`, `orphan`,
 * `divergent`, `miswired` — `DRIFT_CLASSES`' order, the order spec §4 lists
 * them in), then by each drift's primary slug ascending. `reconcile()`
 * already constructs its result in this grouping, so this call is a stable
 * no-op there; it's its own function so any future caller assembling a
 * `Drift[]` by hand (e.g. merging reconciliations across environments) gets
 * the same ordering guarantee without re-deriving it.
 */
export function sortDrifts(drifts: readonly Drift[]): readonly Drift[] {
  return [...drifts].sort(
    (a, b) =>
      DRIFT_CLASSES.indexOf(a.class) - DRIFT_CLASSES.indexOf(b.class) ||
      primarySlug(a).localeCompare(primarySlug(b)),
  );
}
