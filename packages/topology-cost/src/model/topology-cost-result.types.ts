import type { CostDiagnostic } from './diagnostic.types.js';
import type { CostTotals } from './cost-totals.types.js';
import type { ContainerCost } from './container-cost.types.js';
import type { GroupedCost } from './grouped-cost.types.js';
import type { NodeCost } from './node-cost.types.js';
import type { UnattributedCost } from './unattributed-cost.types.js';

/**
 * The full output of `computeTopologyCost`: per-resource pricing, rollups by
 * resource-group/network, cost attributed through `realizes` to c4
 * containers, the committed-vs-schedulable split, and any diagnostics.
 *
 * Scope: this describes cost over the RESOLVED (authored/intended) topology
 * for one environment. It deliberately carries no "intended" qualifier on
 * every field — an actual-cost pass (once the derived tree + recon exist)
 * can be layered on as a sibling result computed the same way, without this
 * shape needing to change.
 */
export interface TopologyCostResult {
  /** The environment this cost was computed for (`resolved.envSlug`). */
  readonly envSlug: string;
  /** Per-resource monthly cost, in resolved-topology resource order. Resources with no `cost` are omitted. */
  readonly nodes: readonly NodeCost[];
  /** Monthly cost subtotals grouped by `resourceGroup`. */
  readonly byResourceGroup: readonly GroupedCost[];
  /** Monthly cost subtotals grouped by `network`. */
  readonly byNetwork: readonly GroupedCost[];
  /** Attributed monthly cost per c4 container, keyed by container slug. */
  readonly byContainer: Readonly<Record<string, ContainerCost>>;
  /** Cost that could not be attributed to any c4 container (no `realizes`). */
  readonly unattributed: UnattributedCost;
  /** Topology-wide totals: all priced cost, and the committed/schedulable split. */
  readonly totals: CostTotals;
  /** Diagnostics raised while computing cost (dangling catalog refs, bad attribution shares). Empty when everything resolved cleanly. */
  readonly diagnostics: readonly CostDiagnostic[];
}
