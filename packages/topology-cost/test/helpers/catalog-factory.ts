import type { Catalog, PricingModeType, ScheduleType, SkuType } from '@workspec/decision-schema';

/**
 * Builds a small, valid-shaped `Catalog` literal for unit tests that don't
 * need the full `azure-nz` fixture (see `load-azure-nz-catalog.ts` for the
 * golden-test catalog). Every table defaults to one row so callers can
 * override just the table(s) their test cares about.
 */
export function makeCatalog(overrides: {
  pricingModes?: PricingModeType[];
  schedules?: ScheduleType[];
  skus?: SkuType[];
}): Catalog {
  return {
    apiVersion: 'workspec.io/v1alpha1',
    kind: 'Catalog',
    metadata: { slug: 'test-catalog' },
    spec: {
      currency: 'NZD',
      asOf: '2026-01-01',
      pricingModes: overrides.pricingModes ?? [{ id: 'payg', label: 'Pay as you go', mult: 1, committed: false }],
      schedules: overrides.schedules ?? [{ id: 'always', label: '24x7', pct: 1 }],
      skus: overrides.skus ?? [{ id: 'sku-a', label: 'Sku A', family: 'Test', price: 100 }],
    },
  };
}
