import type { GroupedCost } from '../model/grouped-cost.types.js';

/**
 * Sums `valueFn(item)` into buckets keyed by `keyFn(item)`, returned sorted
 * alphabetically by key with the `null`-keyed bucket (items with no
 * placement for this lens) last. Shared by the resource-group and network
 * rollups — the design rolls up boundary → environment through both lenses
 * identically, so the bucketing logic is written once.
 */
export function rollupBy<T>(
  items: readonly T[],
  keyFn: (item: T) => string | null,
  valueFn: (item: T) => number,
): readonly GroupedCost[] {
  const totals = new Map<string | null, number>();
  for (const item of items) {
    const key = keyFn(item);
    totals.set(key, (totals.get(key) ?? 0) + valueFn(item));
  }

  return [...totals.entries()]
    .sort(([a], [b]) => {
      if (a === null) return b === null ? 0 : 1;
      if (b === null) return -1;
      return a.localeCompare(b);
    })
    .map(([key, monthly]) => ({ key, monthly }));
}
