/**
 * `@workspec/topology-cost`'s root entry: the pure cost + c4-container
 * attribution layer over a RESOLVED topology (`@workspec/topology-model`'s
 * `resolve()` output) and a decision-catalog Catalog
 * (`@workspec/decision-schema`). No IO, no DOM, no React — every export here
 * is a pure function or a plain data type.
 */
export { computeTopologyCost } from './compute-topology-cost.js';

// ── Result types ─────────────────────────────────────────────────────────────
export type { TopologyCostResult } from './model/topology-cost-result.types.js';
export type { NodeCost } from './model/node-cost.types.js';
export type { GroupedCost } from './model/grouped-cost.types.js';
export type { ContainerCost, ContainerCostContribution } from './model/container-cost.types.js';
export type {
  UnattributedCost,
  UnattributedCostEntry,
  UnattributedReason,
} from './model/unattributed-cost.types.js';
export type { CostTotals } from './model/cost-totals.types.js';
export type {
  BadAttributionSharesDiagnostic,
  CostDiagnostic,
  CostDiagnosticCode,
  MissingModeDiagnostic,
  MissingScheduleDiagnostic,
  MissingSkuDiagnostic,
} from './model/diagnostic.types.js';

// ── Lower-level pieces, exported for callers composing their own pipeline
// (e.g. a CLI that wants priced nodes without attribution). ─────────────────
export { buildCatalogIndex } from './catalog/catalog-index.js';
export type { CatalogIndex } from './catalog/catalog-index.js';
export { resourceCostToLine } from './mapping/resource-cost-to-line.js';
export { computeNodeCosts } from './nodes/compute-node-costs.js';
export type { NodeCostsResult } from './nodes/compute-node-costs.js';
export { computeResourceGroupRollup } from './rollups/compute-resource-group-rollup.js';
export { computeNetworkRollup } from './rollups/compute-network-rollup.js';
export { computeCommittedSplit } from './rollups/compute-committed-split.js';
export { rollupBy } from './rollups/rollup-by.js';
export { computeAttribution } from './attribution/compute-attribution.js';
export type { AttributionResult } from './attribution/compute-attribution.js';
