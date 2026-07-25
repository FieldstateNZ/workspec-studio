import type { Catalog } from '@workspec/decision-schema';
import type { ResolvedTopology } from '@workspec/topology-model';
import { computeAttribution } from './attribution/compute-attribution.js';
import { buildCatalogIndex } from './catalog/catalog-index.js';
import type { TopologyCostResult } from './model/topology-cost-result.types.js';
import { computeNodeCosts } from './nodes/compute-node-costs.js';
import { computeCommittedSplit } from './rollups/compute-committed-split.js';
import { computeNetworkRollup } from './rollups/compute-network-rollup.js';
import { computeResourceGroupRollup } from './rollups/compute-resource-group-rollup.js';

/**
 * Computes cost and c4-container attribution over a RESOLVED topology —
 * never a raw one. `resolved` must come from `@workspec/topology-model`'s
 * `resolve()`, so per-environment overrides, naming, and pruning have
 * already been applied; this function only prices what survived for that
 * one environment.
 *
 * Scope: cost over the resolved (authored/intended) topology only. An
 * intended-vs-actual delta needs the derived tree (drift detection) and is a
 * later recon+cost integration — deliberately out of scope here. This
 * result's shape carries no "intended" qualifier on any field so an actual-
 * cost pass can be layered on as a sibling `TopologyCostResult`, computed the
 * same way, without this shape needing to change.
 */
export function computeTopologyCost(resolved: ResolvedTopology, catalog: Catalog): TopologyCostResult {
  const index = buildCatalogIndex(catalog);
  const { nodes, diagnostics: nodeDiagnostics } = computeNodeCosts(resolved, catalog, index);

  const byResourceGroup = computeResourceGroupRollup(resolved, nodes);
  const byNetwork = computeNetworkRollup(resolved, nodes);
  const totals = computeCommittedSplit(nodes);
  const {
    byContainer,
    unattributed,
    diagnostics: attributionDiagnostics,
  } = computeAttribution(resolved, nodes);

  return {
    envSlug: resolved.envSlug,
    nodes,
    byResourceGroup,
    byNetwork,
    byContainer,
    unattributed,
    totals,
    diagnostics: [...nodeDiagnostics, ...attributionDiagnostics],
  };
}
