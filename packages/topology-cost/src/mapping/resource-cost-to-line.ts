import type { SkuLineType as SkuLine } from '@workspec/decision-schema';
import type { ResolvedResource } from '@workspec/topology-model';

/**
 * Maps a resolved resource's `cost` binding to a decision-engine `SkuLine` so
 * `lineEnvCost` (`@workspec/decision-engine`) can price it — the pure cost
 * formula (§5: `qty × sku.price × mode.mult × effectivePct`) lives there and
 * is never reimplemented in this package. Returns `null` when the resource
 * carries no cost binding (nothing to price).
 *
 * The line's `qty` record carries a single entry, keyed by `envSlug`: a
 * `ResolvedTopology` is already scoped to one environment (overrides already
 * merged in by `resolve()`), so there is no other env key to price against.
 */
export function resourceCostToLine(resource: ResolvedResource, envSlug: string): SkuLine | null {
  if (resource.cost === null) return null;

  return {
    id: resource.slug,
    label: resource.name,
    flat: false,
    sku: resource.cost.sku,
    mode: resource.cost.mode,
    schedule: resource.cost.schedule,
    qty: { [envSlug]: resource.cost.qty },
  };
}
