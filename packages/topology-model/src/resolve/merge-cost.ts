import type { ResourceCost, ResourceCostOverride } from '@workspec/topology-schema';

/**
 * Merges a resource's own per-environment `ResourceCostOverride` patch
 * (`spec.overrides[envSlug].cost`, S1) onto its base `ResourceCost`. Unlike
 * `mergeConfig`, `ResourceCost`'s shape is closed and flat
 * (`sku`/`mode`/`schedule`/`qty`/`attribution`), so this is a field-by-field
 * override rather than a generic merge —
 * `attribution` is a whole-array replace when the patch names it (arrays
 * replace, per the resolve contract), never an element-wise splice.
 *
 * Returns `null` when the resource has no `cost` binding at all AND the
 * override supplies none of the required fields either: a patch is only
 * ever a set of CHANGES to an existing binding, so a resource with no base
 * `cost` and only a partial override (missing `sku`/`mode`/`schedule`) ends
 * up with no cost binding either — the override can't manufacture a whole
 * new one out of a partial patch. This is a schema-shape edge, not a
 * pruning one: a resource's `spec.overrides` entries always belong to THAT
 * resource (S1 — they can't be "for" a different, pruned/absent resource
 * the way v0's `Environment.spec.overrides[resourceSlug]` keys once could).
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
      ...((patch?.attribution ?? base.attribution)
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
