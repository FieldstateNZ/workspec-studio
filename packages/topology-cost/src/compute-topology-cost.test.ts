import { describe, expect, it } from 'vitest';
import { makeCatalog } from '../test/helpers/catalog-factory.js';
import { makeResolvedResource, makeResolvedTopology } from '../test/helpers/resolved-topology-factory.js';
import { computeTopologyCost } from './compute-topology-cost.js';

/**
 * A small, synthetic orchestration test complementing the golden web-app
 * fixture test (`test/golden/web-app-cost.test.ts`): the web-app fixture's
 * catalog binds every resource to a `payg` mode, so the golden test alone
 * never exercises a non-zero committed total. This wires two resources — one
 * committed, one schedulable — through the full `computeTopologyCost`
 * pipeline in one pass.
 */
describe('computeTopologyCost: committed vs schedulable wiring', () => {
  it('splits totals across a committed and a schedulable resource in the same resource group', () => {
    const catalog = makeCatalog({
      skus: [
        { id: 'reserved-sku', label: 'Reserved compute', family: 'Compute', price: 200 },
        { id: 'payg-sku', label: 'PAYG compute', family: 'Compute', price: 50 },
      ],
      pricingModes: [
        { id: 'payg', label: 'Pay as you go', mult: 1, committed: false },
        { id: 'ri1y', label: '1yr Reserved', mult: 0.65, committed: true },
      ],
      schedules: [{ id: 'always', label: '24x7', pct: 1 }],
    });

    const resolved = makeResolvedTopology({
      envSlug: 'prod',
      resources: [
        makeResolvedResource({
          slug: 'reserved-node',
          resourceGroup: 'rg-app',
          realizes: ['api-server'],
          cost: { sku: 'reserved-sku', mode: 'ri1y', schedule: 'always', qty: 1, attribution: [{ container: 'api-server', share: 1 }] },
        }),
        makeResolvedResource({
          slug: 'payg-node',
          resourceGroup: 'rg-app',
          cost: { sku: 'payg-sku', mode: 'payg', schedule: 'always', qty: 2 },
        }),
      ],
    });

    const result = computeTopologyCost(resolved, catalog);

    expect(result.diagnostics).toEqual([]);
    expect(result.totals).toEqual({ all: 230, committed: 130, schedulable: 100 });
    expect(result.byResourceGroup).toEqual([{ key: 'rg-app', monthly: 230 }]);
    expect(result.byContainer['api-server']?.monthly).toBe(130);
    expect(result.unattributed).toEqual({ monthly: 100, entries: [{ resourceSlug: 'payg-node', monthly: 100, reason: 'no-realizes' }] });
  });
});
