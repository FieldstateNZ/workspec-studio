import { describe, expect, it } from 'vitest';
import { computeTopologyCost } from '../../src/index.js';
import { loadAzureNzCatalog } from '../helpers/load-azure-nz-catalog.js';
import { loadResolvedWebApp } from '../helpers/load-resolved-web-app.js';

/**
 * GOLDEN: `computeTopologyCost` over the real web-app topology
 * (`@workspec/topology-schema`'s fixture, resolved by
 * `@workspec/topology-model`) and this package's `azure-nz` catalog, across
 * all three of its environments. Locks per-node pricing, the resource-group
 * and network rollups, the committed/schedulable split, and c4-container
 * attribution — including all three attribution routes the design calls
 * out, which this one fixture happens to exercise together:
 *
 * - `app-service` → `api-server`: explicit `cost.attribution` share (1.0).
 * - `sql` → `primary-db`, `write-fn` → `write-processor`: no attribution,
 *   non-empty `realizes` → even split, `unattributedByDefault: true`.
 * - `cache` (always) and `front-door` (prod only): a `cost` binding but no
 *   `realizes` at all → the explicit `unattributed` bucket.
 */
describe('computeTopologyCost: web-app fixture x azure-nz catalog, golden across all three environments', () => {
  it('prod: five priced resources, rg-app/snet-workload rollups, all-PAYG committed split, three attribution routes', async () => {
    const resolved = await loadResolvedWebApp('prod');
    const catalog = await loadAzureNzCatalog();

    const result = computeTopologyCost(resolved, catalog);

    expect(result.envSlug).toBe('prod');
    expect(result.diagnostics).toEqual([]);

    expect(result.nodes).toEqual(
      expect.arrayContaining([
        { slug: 'app-service', monthly: 1470, mode: 'payg', sku: 'p2v3', committed: false },
        { slug: 'cache', monthly: 130, mode: 'payg', sku: 'standard-c1', committed: false },
        { slug: 'front-door', monthly: 45, mode: 'payg', sku: 'standard', committed: false },
        { slug: 'sql', monthly: 365, mode: 'payg', sku: 'gp-gen5-2', committed: false },
        { slug: 'write-fn', monthly: 15, mode: 'payg', sku: 'consumption', committed: false },
      ]),
    );
    expect(result.nodes).toHaveLength(5);

    expect(result.byResourceGroup).toEqual([{ key: 'rg-app', monthly: 2025 }]);
    expect(result.byNetwork).toEqual(
      expect.arrayContaining([
        { key: 'snet-workload', monthly: 1980 },
        { key: null, monthly: 45 },
      ]),
    );

    expect(result.totals).toEqual({ all: 2025, committed: 0, schedulable: 2025 });

    expect(result.byContainer['api-server']).toEqual({
      container: 'api-server',
      monthly: 1470,
      unattributedByDefault: false,
      contributions: [
        { resourceSlug: 'app-service', share: 1, monthly: 1470, unattributedByDefault: false },
      ],
    });
    expect(result.byContainer['primary-db']).toEqual({
      container: 'primary-db',
      monthly: 365,
      unattributedByDefault: true,
      contributions: [{ resourceSlug: 'sql', share: 1, monthly: 365, unattributedByDefault: true }],
    });
    expect(result.byContainer['write-processor']).toEqual({
      container: 'write-processor',
      monthly: 15,
      unattributedByDefault: true,
      contributions: [
        { resourceSlug: 'write-fn', share: 1, monthly: 15, unattributedByDefault: true },
      ],
    });

    expect(result.unattributed).toEqual({
      monthly: 175,
      entries: [
        { resourceSlug: 'cache', monthly: 130, reason: 'no-realizes' },
        { resourceSlug: 'front-door', monthly: 45, reason: 'no-realizes' },
      ],
    });
  });

  it('dev: front-door absent (cheaper app-service tier), rollups and attribution shrink to match', async () => {
    const resolved = await loadResolvedWebApp('dev');
    const catalog = await loadAzureNzCatalog();

    const result = computeTopologyCost(resolved, catalog);

    expect(result.envSlug).toBe('dev');
    expect(result.nodes).toHaveLength(4);
    expect(result.nodes).toEqual(
      expect.arrayContaining([
        { slug: 'app-service', monthly: 245, mode: 'payg', sku: 'p1v3', committed: false },
      ]),
    );
    expect(result.nodes.find((n) => n.slug === 'front-door')).toBeUndefined();

    expect(result.byResourceGroup).toEqual([{ key: 'rg-app', monthly: 755 }]);
    expect(result.byNetwork).toEqual([{ key: 'snet-workload', monthly: 755 }]);
    expect(result.totals).toEqual({ all: 755, committed: 0, schedulable: 755 });

    expect(result.byContainer['api-server']?.monthly).toBe(245);
    expect(result.unattributed).toEqual({
      monthly: 130,
      entries: [{ resourceSlug: 'cache', monthly: 130, reason: 'no-realizes' }],
    });
  });

  it('test: same shape as dev — qty/tier overrides flow through resolve() identically', async () => {
    const resolved = await loadResolvedWebApp('test');
    const catalog = await loadAzureNzCatalog();

    const result = computeTopologyCost(resolved, catalog);

    expect(result.envSlug).toBe('test');
    expect(result.totals).toEqual({ all: 755, committed: 0, schedulable: 755 });
    expect(result.nodes.find((n) => n.slug === 'app-service')).toEqual({
      slug: 'app-service',
      monthly: 245,
      mode: 'payg',
      sku: 'p1v3',
      committed: false,
    });
  });

  it('costs change correctly across dev/test/prod as qty and sku overrides flow through resolve()', async () => {
    const catalog = await loadAzureNzCatalog();
    const [dev, test, prod] = await Promise.all([
      loadResolvedWebApp('dev').then((r) => computeTopologyCost(r, catalog)),
      loadResolvedWebApp('test').then((r) => computeTopologyCost(r, catalog)),
      loadResolvedWebApp('prod').then((r) => computeTopologyCost(r, catalog)),
    ]);

    // dev/test share the same override (qty: 1, base sku p1v3) — identical totals.
    expect(dev.totals.all).toBe(test.totals.all);
    // prod overrides to sku p2v3 + qty 3, and adds front-door — strictly pricier.
    expect(prod.totals.all).toBeGreaterThan(dev.totals.all);
    expect(prod.totals.all).toBe(2025);
    expect(dev.totals.all).toBe(755);
  });
});
