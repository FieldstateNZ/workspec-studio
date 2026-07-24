/**
 * Why one resource's cost landed in the `unattributed` bucket instead of
 * being split across c4 containers. Currently the only route in is a priced
 * resource with an empty `realizes` — closed union so a future second route
 * (e.g. an explicitly-declared "infrastructure overhead" resource) is a
 * deliberate, reviewed addition rather than an untyped string.
 */
export type UnattributedReason = 'no-realizes';

/** One priced resource whose cost could not be attributed to any c4 container. */
export interface UnattributedCostEntry {
  /** The resource's slug. */
  readonly resourceSlug: string;
  /** The resource's full monthly cost (never split — there is nothing to split it across). */
  readonly monthly: number;
  /** Why this resource's cost is unattributed. */
  readonly reason: UnattributedReason;
}

/**
 * The explicit "we could not attribute this" bucket (spec §5: never silent).
 * A non-empty `entries` means real infrastructure spend that today's
 * `realizes`/`cost.attribution` authoring does not explain — a signal for
 * the topology author, not a bug in this package.
 */
export interface UnattributedCost {
  /** Sum of `entries[].monthly`. */
  readonly monthly: number;
  /** Every unattributed resource, in resolved-topology resource order. */
  readonly entries: readonly UnattributedCostEntry[];
}
