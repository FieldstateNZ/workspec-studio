import type { LensTree } from '../model/lens-tree.types.js';
import type { ResolvedTopology } from '../model/resolved-topology.types.js';
import { buildLensTree } from './build-lens-tree.js';

/**
 * Builds the network lens: `vnet`/`subnet` resources are container boxes,
 * nested via each resource's `network` ref; `resource-group` resources
 * appear as plain nodes here (grouping-kind status is lens-scoped); a
 * resource with no `network` ref (a PaaS resource with no network
 * placement) sits at the top level, outside any vnet.
 */
export function buildNetworkTree(resolved: ResolvedTopology): LensTree {
  return buildLensTree(resolved, 'network');
}
