import type { LensTree } from '../model/lens-tree.types.js';
import type { ResolvedTopology } from '../model/resolved-topology.types.js';
import { buildLensTree } from './build-lens-tree.js';

/**
 * Builds the resource-group lens: `resource-group` resources are container
 * boxes, nested via each resource's `resourceGroup` ref; `vnet`/`subnet`
 * resources appear as plain nodes here (this is where the design's
 * `RG_NODES` behaviour falls out of the single grouping-kind-per-lens rule,
 * rather than needing a special case); a resource with no `resourceGroup`
 * ref sits at the top level, outside any resource group.
 */
export function buildResourceGroupTree(resolved: ResolvedTopology): LensTree {
  return buildLensTree(resolved, 'rg');
}
