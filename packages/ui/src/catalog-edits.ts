// Pure, immutable edit helpers for the SIMPLE catalog model (porting decision
// P3): SKUs (`label`/`family`/`price`), pricing modes (`mult`/`committed`, …),
// and schedules (`pct`, …). The Catalog view keeps a local draft and persists
// each change through the repository port; these helpers never mutate their
// input, so a fresh catalog object flows back into the engine and every option
// that references it reprices. There is deliberately no rich provider/resource
// model here — that was left to Enterprise.

import type { Catalog, PricingModeType, ScheduleType, SkuType } from '@workspec/decision-schema';

// New ids are slugs valid against the schema's `identifier` regex
// (`[A-Za-z0-9][A-Za-z0-9_-]*`). A monotonic counter keeps them unique within a
// session; collisions with existing ids are avoided by suffixing when needed.
let seq = 0;

function uniqueId(prefix: string, taken: ReadonlySet<string>): string {
  let id = `${prefix}-${(seq += 1)}`;
  while (taken.has(id)) id = `${prefix}-${(seq += 1)}`;
  return id;
}

function mapSpec<K extends 'skus' | 'pricingModes' | 'schedules'>(
  catalog: Catalog,
  key: K,
  next: Catalog['spec'][K],
): Catalog {
  return { ...catalog, spec: { ...catalog.spec, [key]: next } };
}

// ── SKUs ─────────────────────────────────────────────────────────────────────

/** Patchable SKU fields the editor exposes. */
export type SkuPatch = Partial<Pick<SkuType, 'label' | 'family' | 'price' | 'unit'>>;

/** Set one SKU's `label` / `family` / `price` / `unit`. */
export function setSku(catalog: Catalog, skuId: string, patch: SkuPatch): Catalog {
  return mapSpec(
    catalog,
    'skus',
    catalog.spec.skus.map((sku) => (sku.id === skuId ? { ...sku, ...patch } : sku)),
  );
}

/** Append a new SKU (list-priced at 0) and return the updated catalog + its id. */
export function addSku(catalog: Catalog): { catalog: Catalog; id: string } {
  const id = uniqueId('sku', new Set(catalog.spec.skus.map((s) => s.id)));
  const sku: SkuType = { id, label: 'New SKU', family: 'General', price: 0 };
  return { catalog: mapSpec(catalog, 'skus', [...catalog.spec.skus, sku]), id };
}

/** Remove a SKU by id. */
export function removeSku(catalog: Catalog, skuId: string): Catalog {
  return mapSpec(
    catalog,
    'skus',
    catalog.spec.skus.filter((sku) => sku.id !== skuId),
  );
}

// ── Pricing modes ──────────────────────────────────────────────────────────────

/** Patchable pricing-mode fields the editor exposes. */
export type PricingModePatch = Partial<
  Pick<PricingModeType, 'label' | 'short' | 'mult' | 'committed' | 'note'>
>;

/** Set one pricing mode's `label` / `short` / `mult` / `committed` / `note`. */
export function setPricingMode(catalog: Catalog, modeId: string, patch: PricingModePatch): Catalog {
  return mapSpec(
    catalog,
    'pricingModes',
    catalog.spec.pricingModes.map((mode) => (mode.id === modeId ? { ...mode, ...patch } : mode)),
  );
}

/** Append a new pricing mode (PAYG list, non-committed) and return its id. */
export function addPricingMode(catalog: Catalog): { catalog: Catalog; id: string } {
  const id = uniqueId('mode', new Set(catalog.spec.pricingModes.map((m) => m.id)));
  const mode: PricingModeType = { id, label: 'New mode', mult: 1, committed: false };
  return { catalog: mapSpec(catalog, 'pricingModes', [...catalog.spec.pricingModes, mode]), id };
}

/** Remove a pricing mode by id. */
export function removePricingMode(catalog: Catalog, modeId: string): Catalog {
  return mapSpec(
    catalog,
    'pricingModes',
    catalog.spec.pricingModes.filter((mode) => mode.id !== modeId),
  );
}

// ── Schedules ──────────────────────────────────────────────────────────────────

/** Patchable schedule fields the editor exposes. */
export type SchedulePatch = Partial<Pick<ScheduleType, 'label' | 'pct' | 'note'>>;

/** Set one schedule's `label` / `pct` / `note`. `pct` is clamped to 0..1. */
export function setSchedule(catalog: Catalog, scheduleId: string, patch: SchedulePatch): Catalog {
  const clamped: SchedulePatch =
    patch.pct !== undefined ? { ...patch, pct: Math.max(0, Math.min(1, patch.pct)) } : patch;
  return mapSpec(
    catalog,
    'schedules',
    catalog.spec.schedules.map((schedule) =>
      schedule.id === scheduleId ? { ...schedule, ...clamped } : schedule,
    ),
  );
}

/** Append a new 24×7 schedule and return its id. */
export function addSchedule(catalog: Catalog): { catalog: Catalog; id: string } {
  const id = uniqueId('sched', new Set(catalog.spec.schedules.map((s) => s.id)));
  const schedule: ScheduleType = { id, label: 'New schedule', pct: 1 };
  return { catalog: mapSpec(catalog, 'schedules', [...catalog.spec.schedules, schedule]), id };
}

/** Remove a schedule by id. */
export function removeSchedule(catalog: Catalog, scheduleId: string): Catalog {
  return mapSpec(
    catalog,
    'schedules',
    catalog.spec.schedules.filter((schedule) => schedule.id !== scheduleId),
  );
}
