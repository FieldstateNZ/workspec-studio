import type { ResourceCost, ResourceCostOverride } from '@workspec/topology-schema';

/**
 * Merges an environment's `ResourceCostOverride` patch onto a resource's own
 * `ResourceCost`. Unlike `deepMergeConfig`, `ResourceCost`'s shape is closed
 * and flat (`sku`/`mode`/`schedule`/`qty`/`attribution`), so this is a
 * field-by-field override rather than a generic recursive merge —
 * `attribution` is a whole-array replace when the patch names it (arrays
 * replace, per the resolve contract), never an element-wise splice.
 *
 * Returns `null` when the resource has no `cost` binding at all AND the
 * override supplies none of the required fields either — an override that
 * only patches an *existing* cost binding is well-formed even for a
 * resource whose `cost` is absent (a no-op, per the resolve contract: "an
 * override keyed to a resource that was pruned/absent is a no-op"), but an
 * override can't manufacture a whole new cost binding out of a partial
 * patch that's missing `sku`/`mode`/`schedule`.
 */
export function mergeCost(
  base: ResourceCost | undefined,
  patch: ResourceCostOverride | undefined,
): ResourceCost | null {
  if (base) {
    return {
      sku: patch?.sku ?? base.sku,
      mode: patch?.mode ?? base.mode,
      schedule: patch?.schedule ?? base.schedule,
      qty: patch?.qty ?? base.qty,
      ...(patch?.attribution ?? base.attribution
        ? { attribution: patch?.attribution ?? base.attribution }
        : {}),
    };
  }

  if (patch?.sku !== undefined && patch.mode !== undefined && patch.schedule !== undefined) {
    return {
      sku: patch.sku,
      mode: patch.mode,
      schedule: patch.schedule,
      qty: patch.qty ?? 1,
      ...(patch.attribution ? { attribution: patch.attribution } : {}),
    };
  }

  return null;
}
