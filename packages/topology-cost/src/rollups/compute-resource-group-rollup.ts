import type { ResolvedTopology } from '@workspec/topology-model';
import type { GroupedCost } from '../model/grouped-cost.types.js';
import type { NodeCost } from '../model/node-cost.types.js';
import { rollupBy } from './rollup-by.js';

/**
 * Monthly cost subtotals grouped by `resourceGroup` (the resource-group-lens
 * boundary). A priced resource with no `resourceGroup` placement rolls into
 * the `key: null` bucket.
 */
export function computeResourceGroupRollup(
  resolved: ResolvedTopology,
  nodes: readonly NodeCost[],
): readonly GroupedCost[] {
  const resourceGroupBySlug = new Map(resolved.resources.map((r) => [r.slug, r.resourceGroup]));
  return rollupBy(
    nodes,
    (node) => resourceGroupBySlug.get(node.slug) ?? null,
    (node) => node.monthly,
  );
}
