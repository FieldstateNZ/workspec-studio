/**
 * A monthly cost subtotal for one bucket of a rollup (e.g. one resource group,
 * or one network). `key` is `null` for the bucket of resources that carry no
 * placement ref for that lens (e.g. a `client`-kind resource has neither a
 * `network` nor a `resourceGroup`) — an explicit bucket rather than a
 * stringly-typed sentinel, so "unplaced" is visible and type-safe.
 */
export interface GroupedCost {
  /** The resource-group or network slug this subtotal covers, or `null` for unplaced resources. */
  readonly key: string | null;
  /** Sum of `monthly` across every priced resource in this bucket. */
  readonly monthly: number;
}
