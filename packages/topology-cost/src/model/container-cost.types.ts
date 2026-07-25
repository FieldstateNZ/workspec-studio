/**
 * One resource's contribution to one c4 container's attributed cost.
 * `unattributedByDefault` is `true` when this share came from the even-split
 * fallback (the resource named the container via `realizes` but authored no
 * explicit `cost.attribution`) rather than an author-supplied share — the
 * design's "unattributed-by-default" must stay visible to callers, never
 * silently indistinguishable from a deliberate split.
 */
export interface ContainerCostContribution {
  /** The contributing resource's slug. */
  readonly resourceSlug: string;
  /** The fraction of the resource's monthly cost attributed to this container. */
  readonly share: number;
  /** `resource.monthly * share`. */
  readonly monthly: number;
  /** `true` if this share came from the even-split-across-`realizes` fallback, not an authored `cost.attribution` entry. */
  readonly unattributedByDefault: boolean;
}

/**
 * One c4 container's attributed monthly cost: the sum of every contributing
 * resource's share, plus the contributions themselves for drill-down.
 */
export interface ContainerCost {
  /** The c4 container slug. */
  readonly container: string;
  /** Sum of `contributions[].monthly`. */
  readonly monthly: number;
  /** `true` if ANY contribution to this container came from the even-split fallback rather than an authored share. */
  readonly unattributedByDefault: boolean;
  /** Every resource contributing to this container's cost, in resolved-topology resource order. */
  readonly contributions: readonly ContainerCostContribution[];
}
