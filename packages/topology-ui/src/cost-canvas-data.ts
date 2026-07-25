// Pure mapping from a `computeTopologyCost()` result to the Cost view's
// CANVAS props (`TopologyCanvas`'s `costBySlug`/`boundaryCostBySlug`
// extension points) — mirrors `drift-canvas-data.ts`'s role for the Drift
// view.

import type { TopologyCostResult } from '@workspec/topology-cost';
import type { LensId } from '@workspec/topology-model';
import { formatMonthly } from './format-money.js';
import type { NodeCost } from './overlays.js';

/** Per-node monthly cost, shaped for `TopologyCanvas`'s `costBySlug` (the deliberately minimal canvas-pill `NodeCost` — see `overlays.ts`). */
export function buildCostBySlug(cost: TopologyCostResult, currency: string): Record<string, NodeCost> {
  const bySlug: Record<string, NodeCost> = {};
  for (const node of cost.nodes) {
    bySlug[node.slug] = { monthly: node.monthly, currency };
  }
  return bySlug;
}

/**
 * Formatted monthly subtotal per boundary container slug, for
 * `TopologyCanvas`'s `boundaryCostBySlug` — `byResourceGroup` in the `rg`
 * lens (where a resource group renders as the boundary box), `byNetwork` in
 * the `network` lens (where a vnet/subnet does). `key: null` buckets
 * (unplaced resources) have no boundary box to badge, so they're skipped
 * here entirely — `unattributed`/`byContainer` already surface that spend
 * in the side panel (see `cost-panel-data.ts`).
 */
export function buildBoundaryCostBySlug(
  cost: TopologyCostResult,
  lens: LensId,
  currency: string,
): Record<string, string> {
  const rollup = lens === 'rg' ? cost.byResourceGroup : cost.byNetwork;
  const bySlug: Record<string, string> = {};
  for (const bucket of rollup) {
    if (bucket.key === null) continue;
    bySlug[bucket.key] = formatMonthly(bucket.monthly, currency);
  }
  return bySlug;
}
