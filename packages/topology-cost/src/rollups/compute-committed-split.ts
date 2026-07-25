import type { CostTotals } from '../model/cost-totals.types.js';
import type { NodeCost } from '../model/node-cost.types.js';

/**
 * Splits the topology-wide monthly cost into committed (reserved, bills
 * flat) vs schedulable (everything else) totals, from each node's
 * pre-computed `committed` flag.
 */
export function computeCommittedSplit(nodes: readonly NodeCost[]): CostTotals {
  let all = 0;
  let committed = 0;
  for (const node of nodes) {
    all += node.monthly;
    if (node.committed) committed += node.monthly;
  }
  return { all, committed, schedulable: all - committed };
}
