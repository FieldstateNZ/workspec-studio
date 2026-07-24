import type {
  Catalog,
  PricingModeType as PricingMode,
  ScheduleType as Schedule,
  SkuType as Sku,
} from '@workspec/decision-schema';

/**
 * A read-only lookup index over a Catalog's three priced tables, by id.
 *
 * `@workspec/decision-engine` builds an equivalent index internally (memoised
 * per catalog object, for `lineEnvCost`'s own use) but does not export it —
 * this package needs its own read access to the same tables to build
 * diagnostics for a dangling ref and the committed-vs-schedulable split,
 * both of which `lineEnvCost` deliberately keeps opaque (it silently defaults
 * an unresolved mode/schedule rather than surfacing it as an error).
 */
export interface CatalogIndex {
  readonly skus: ReadonlyMap<string, Sku>;
  readonly modes: ReadonlyMap<string, PricingMode>;
  readonly schedules: ReadonlyMap<string, Schedule>;
}

/** Builds a {@link CatalogIndex} from a Catalog's `spec` tables. */
export function buildCatalogIndex(catalog: Catalog): CatalogIndex {
  return {
    skus: new Map(catalog.spec.skus.map((sku) => [sku.id, sku])),
    modes: new Map(catalog.spec.pricingModes.map((mode) => [mode.id, mode])),
    schedules: new Map(catalog.spec.schedules.map((schedule) => [schedule.id, schedule])),
  };
}
