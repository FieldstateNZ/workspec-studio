import { describe, expect, it } from 'vitest';
import { makeCatalog } from '../../test/helpers/catalog-factory.js';
import { makeResolvedResource, makeResolvedTopology } from '../../test/helpers/resolved-topology-factory.js';
import { buildCatalogIndex } from '../catalog/catalog-index.js';
import { computeNodeCosts } from './compute-node-costs.js';

describe('computeNodeCosts', () => {
  it('omits resources with no cost binding', () => {
    const resolved = makeResolvedTopology({ resources: [makeResolvedResource({ slug: 'client' })] });
    const catalog = makeCatalog({});

    const { nodes, diagnostics } = computeNodeCosts(resolved, catalog, buildCatalogIndex(catalog));

    expect(nodes).toEqual([]);
    expect(diagnostics).toEqual([]);
  });

  it('prices a resolvable sku/mode/schedule with no diagnostics', () => {
    const catalog = makeCatalog({
      skus: [{ id: 'sku-a', label: 'Sku A', family: 'Test', price: 100 }],
    });
    const resolved = makeResolvedTopology({
      envSlug: 'prod',
      resources: [
        makeResolvedResource({
          slug: 'app',
          cost: { sku: 'sku-a', mode: 'payg', schedule: 'always', qty: 2 },
        }),
      ],
    });

    const { nodes, diagnostics } = computeNodeCosts(resolved, catalog, buildCatalogIndex(catalog));

    expect(diagnostics).toEqual([]);
    expect(nodes).toEqual([
      { slug: 'app', monthly: 200, mode: 'payg', sku: 'sku-a', committed: false },
    ]);
  });

  it('flags a dangling sku ref and prices it as 0, per lineEnvCost', () => {
    const catalog = makeCatalog({});
    const resolved = makeResolvedTopology({
      resources: [
        makeResolvedResource({
          slug: 'app',
          cost: { sku: 'unknown-sku', mode: 'payg', schedule: 'always', qty: 1 },
        }),
      ],
    });

    const { nodes, diagnostics } = computeNodeCosts(resolved, catalog, buildCatalogIndex(catalog));

    expect(nodes).toEqual([
      { slug: 'app', monthly: 0, mode: 'payg', sku: 'unknown-sku', committed: false },
    ]);
    expect(diagnostics).toEqual([
      expect.objectContaining({ code: 'missing-sku', resourceSlug: 'app', ref: 'unknown-sku' }),
    ]);
  });

  it('flags a dangling mode ref, defaults to PAYG mult, and reports committed:false', () => {
    const catalog = makeCatalog({
      skus: [{ id: 'sku-a', label: 'Sku A', family: 'Test', price: 100 }],
    });
    const resolved = makeResolvedTopology({
      resources: [
        makeResolvedResource({
          slug: 'app',
          cost: { sku: 'sku-a', mode: 'unknown-mode', schedule: 'always', qty: 1 },
        }),
      ],
    });

    const { nodes, diagnostics } = computeNodeCosts(resolved, catalog, buildCatalogIndex(catalog));

    expect(nodes[0]).toEqual({ slug: 'app', monthly: 100, mode: 'unknown-mode', sku: 'sku-a', committed: false });
    expect(diagnostics).toEqual([
      expect.objectContaining({ code: 'missing-mode', resourceSlug: 'app', ref: 'unknown-mode' }),
    ]);
  });

  it('flags a dangling schedule ref and defaults its effective pct to 1', () => {
    const catalog = makeCatalog({
      skus: [{ id: 'sku-a', label: 'Sku A', family: 'Test', price: 100 }],
    });
    const resolved = makeResolvedTopology({
      resources: [
        makeResolvedResource({
          slug: 'app',
          cost: { sku: 'sku-a', mode: 'payg', schedule: 'unknown-schedule', qty: 1 },
        }),
      ],
    });

    const { nodes, diagnostics } = computeNodeCosts(resolved, catalog, buildCatalogIndex(catalog));

    expect(nodes[0]?.monthly).toBe(100);
    expect(diagnostics).toEqual([
      expect.objectContaining({ code: 'missing-schedule', resourceSlug: 'app', ref: 'unknown-schedule' }),
    ]);
  });

  it('reports committed:true when the bound mode is a committed catalog pricing mode', () => {
    const catalog = makeCatalog({
      skus: [{ id: 'sku-a', label: 'Sku A', family: 'Test', price: 100 }],
      pricingModes: [{ id: 'ri1y', label: '1yr Reserved', mult: 0.65, committed: true }],
      schedules: [{ id: 'business', label: 'Business hours', pct: 0.3 }],
    });
    const resolved = makeResolvedTopology({
      resources: [
        makeResolvedResource({
          slug: 'app',
          // committed modes ignore the schedule entirely (effPct = 1) — see lineEnvCost.
          cost: { sku: 'sku-a', mode: 'ri1y', schedule: 'business', qty: 2 },
        }),
      ],
    });

    const { nodes, diagnostics } = computeNodeCosts(resolved, catalog, buildCatalogIndex(catalog));

    expect(diagnostics).toEqual([]);
    expect(nodes[0]).toEqual({ slug: 'app', monthly: 130, mode: 'ri1y', sku: 'sku-a', committed: true });
  });
});
