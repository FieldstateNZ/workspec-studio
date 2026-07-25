import type { ResourceCost } from '@workspec/topology-schema';
import type { CostKeyDiff } from '../model/drift.types.js';

const COST_KEYS = ['sku', 'mode', 'schedule', 'qty'] as const;

/** `ResourceCost.qty`'s own schema default (`@workspec/topology-schema`'s `common.ts`) — mirrored here so a hand-built `DerivedTopology` that skips `ResourceCost.parse()` can't manufacture a false `qty` divergence just by omitting the field. */
const DEFAULT_QTY = 1;

function qtyOf(cost: ResourceCost | null): number {
  return cost?.qty ?? DEFAULT_QTY;
}

/**
 * Diffs the priced fields of two resolved `cost` bindings — `sku`/`mode`/
 * `schedule`/`qty` (spec §4's `divergent` class: "cost.sku/tier diff").
 * `attribution` (the c4 cost-attribution split) is deliberately excluded:
 * it's a bookkeeping concern of the authored side alone — a deployed
 * resource has nothing on the actual side to compare it against, so
 * reporting it as "differing" would always fire and never mean anything.
 *
 * `qty` is normalized to its schema default (`1`) on whichever side omits
 * it, rather than compared as `undefined`: `ResourceCost.qty` is a Zod
 * `.default(1)` field, so `ResourceCost.parse()` always fills it in, but a
 * `DerivedTopology` is this package's own type (not Zod-validated) — a
 * future CLI building one straight from adapter output could plausibly
 * carry `qty: undefined`, and that must read as "1, the default" rather
 * than as a spurious divergence against an authored `qty: 1`.
 */
export function diffCost(
  authored: ResourceCost | null,
  actual: ResourceCost | null,
): readonly CostKeyDiff[] {
  if (authored === null && actual === null) return [];

  return COST_KEYS.filter((key) => {
    if (key === 'qty') return qtyOf(authored) !== qtyOf(actual);
    return authored?.[key] !== actual?.[key];
  }).map((key) => ({
    key,
    authored: key === 'qty' ? qtyOf(authored) : authored?.[key],
    actual: key === 'qty' ? qtyOf(actual) : actual?.[key],
  }));
}
