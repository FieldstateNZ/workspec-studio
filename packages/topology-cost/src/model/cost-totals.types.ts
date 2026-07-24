/**
 * The topology-wide monthly cost, split by billing shape. `committed` bills
 * flat regardless of schedule (reserved capacity); `schedulable` is
 * everything else (PAYG-style modes whose cost already reflects the bound
 * schedule's `pct`). `all === committed + schedulable` by construction.
 */
export interface CostTotals {
  /** Sum of every priced resource's monthly cost. */
  readonly all: number;
  /** Sum of monthly cost for resources bound to a committed (reserved) pricing mode. */
  readonly committed: number;
  /** Sum of monthly cost for resources bound to a non-committed (schedulable) pricing mode. */
  readonly schedulable: number;
}
