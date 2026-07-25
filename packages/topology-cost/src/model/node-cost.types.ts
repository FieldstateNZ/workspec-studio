/**
 * The priced cost of one resolved resource, for one environment.
 *
 * `mode` and `sku` are carried through (not just the number) so a caller can
 * split committed (reservable, billed flat) vs schedulable (idles on a
 * schedule) resources without re-deriving the mode from the catalog —
 * mirrors the drift+cost design's `committed`/`schedulable` split.
 * `committed` is looked up once here (from the catalog's `pricingModes`, the
 * same default-to-PAYG rule `@workspec/decision-engine`'s `lineEnvCost` uses
 * for an unresolvable mode) so downstream rollups don't need catalog access.
 */
export interface NodeCost {
  /** The resource's slug (unique within the resolved topology). */
  readonly slug: string;
  /** Monthly cost in the catalog's currency, from `lineEnvCost`. */
  readonly monthly: number;
  /** The resource's bound pricing mode id, as authored (post-override). */
  readonly mode: string;
  /** The resource's bound catalog sku id, as authored (post-override). */
  readonly sku: string;
  /** Whether `mode` resolves to a committed (reserved, bills-flat) catalog pricing mode. */
  readonly committed: boolean;
}
