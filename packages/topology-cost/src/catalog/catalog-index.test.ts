import { describe, expect, it } from 'vitest';
import { makeCatalog } from '../../test/helpers/catalog-factory.js';
import { buildCatalogIndex } from './catalog-index.js';

describe('buildCatalogIndex', () => {
  it('indexes skus, pricing modes, and schedules by id', () => {
    const catalog = makeCatalog({
      skus: [{ id: 'p1v3', label: 'P1v3', family: 'App hosting', price: 245 }],
      pricingModes: [{ id: 'ri1y', label: '1yr Reserved', mult: 0.65, committed: true }],
      schedules: [{ id: 'business', label: 'Business hours', pct: 0.3 }],
    });

    const index = buildCatalogIndex(catalog);

    expect(index.skus.get('p1v3')?.price).toBe(245);
    expect(index.modes.get('ri1y')?.committed).toBe(true);
    expect(index.schedules.get('business')?.pct).toBe(0.3);
    expect(index.skus.has('unknown')).toBe(false);
  });
});
