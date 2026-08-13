import type {
  Catalog,
  LineType as Line,
  PricingModeType as PricingMode,
  ScheduleType as Schedule,
  SkuType as Sku,
} from '@workspec/decision-schema';

interface CatalogIndex {
  skus: Map<string, Sku>;
  modes: Map<string, PricingMode>;
  schedules: Map<string, Schedule>;
}

const indexCache = new WeakMap<Catalog, CatalogIndex>();

function catalogIndex(catalog: Catalog): CatalogIndex {
  const cached = indexCache.get(catalog);
  if (cached !== undefined) return cached;
  const index = {
    skus: new Map(catalog.spec.skus.map((sku) => [sku.id, sku])),
    modes: new Map(catalog.spec.pricingModes.map((mode) => [mode.id, mode])),
    schedules: new Map(catalog.spec.schedules.map((schedule) => [schedule.id, schedule])),
  };
  indexCache.set(catalog, index);
  return index;
}

/**
 * Retained pricing kernel used by Topology. It is no longer part of the
 * Decision artifact model and will move with the pricing/catalog concern.
 */
export function lineEnvCost(line: Line, env: string, catalog: Catalog): number {
  if (line.flat) return line.amount[env] ?? 0;
  const qty = line.qty[env] ?? 0;
  if (qty === 0) return 0;
  const index = catalogIndex(catalog);
  const sku = index.skus.get(line.sku);
  if (sku === undefined) return 0;
  const mode = index.modes.get(line.mode) ?? { mult: 1, committed: false };
  const schedule = index.schedules.get(line.schedule) ?? { pct: 1 };
  return sku.price * mode.mult * qty * (mode.committed ? 1 : schedule.pct);
}
