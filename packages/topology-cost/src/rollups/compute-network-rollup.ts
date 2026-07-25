import type { ResolvedTopology } from '@workspec/topology-model';
import type { GroupedCost } from '../model/grouped-cost.types.js';
import type { NodeCost } from '../model/node-cost.types.js';
import { rollupBy } from './rollup-by.js';

/**
 * Monthly cost subtotals grouped by `network` (the network-lens boundary). A
 * priced resource with no `network` placement rolls into the `key: null`
 * bucket.
 */
export function computeNetworkRollup(
  resolved: ResolvedTopology,
  nodes: readonly NodeCost[],
): readonly GroupedCost[] {
  const networkBySlug = new Map(resolved.resources.map((r) => [r.slug, r.network]));
  return rollupBy(
    nodes,
    (node) => networkBySlug.get(node.slug) ?? null,
    (node) => node.monthly,
  );
}
