import { describe, expect, it } from 'vitest';
import { makeResolvedResource, makeResolvedTopology } from '../../test/helpers/resolved-topology-factory.js';
import type { NodeCost } from '../model/node-cost.types.js';
import { computeAttribution } from './compute-attribution.js';

function node(slug: string, monthly: number): NodeCost {
  return { slug, monthly, mode: 'payg', sku: 'sku-a', committed: false };
}

describe('computeAttribution', () => {
  it('splits explicit attribution shares across multiple containers exactly as authored', () => {
    const resolved = makeResolvedTopology({
      resources: [
        makeResolvedResource({
          slug: 'shared-db',
          realizes: ['orders', 'billing'],
          cost: {
            sku: 'sku-a',
            mode: 'payg',
            schedule: 'always',
            qty: 1,
            attribution: [
              { container: 'orders', share: 0.6 },
              { container: 'billing', share: 0.4 },
            ],
          },
        }),
      ],
    });

    const result = computeAttribution(resolved, [node('shared-db', 1000)]);

    expect(result.diagnostics).toEqual([]);
    expect(result.byContainer.orders).toEqual({
      container: 'orders',
      monthly: 600,
      unattributedByDefault: false,
      contributions: [{ resourceSlug: 'shared-db', share: 0.6, monthly: 600, unattributedByDefault: false }],
    });
    expect(result.byContainer.billing?.monthly).toBe(400);
    expect(result.unattributed).toEqual({ monthly: 0, entries: [] });
  });

  it('applies bad attribution shares AS AUTHORED and flags them, without renormalizing', () => {
    const resolved = makeResolvedTopology({
      resources: [
        makeResolvedResource({
          slug: 'over-shared',
          cost: {
            sku: 'sku-a',
            mode: 'payg',
            schedule: 'always',
            qty: 1,
            attribution: [
              { container: 'a', share: 0.7 },
              { container: 'b', share: 0.7 },
            ],
          },
        }),
      ],
    });

    const result = computeAttribution(resolved, [node('over-shared', 100)]);

    // 0.7 + 0.7 = 1.4 monthly-equivalents spread across the two containers —
    // NOT renormalized down to sum to the resource's own 100.
    expect(result.byContainer.a?.monthly).toBe(70);
    expect(result.byContainer.b?.monthly).toBe(70);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: 'bad-attribution-shares', resourceSlug: 'over-shared', sum: 1.4 }),
    ]);
  });

  it('even-splits across multiple realized containers with no explicit attribution, flagged unattributedByDefault', () => {
    const resolved = makeResolvedTopology({
      resources: [makeResolvedResource({ slug: 'sql', realizes: ['primary-db', 'reporting-db'], cost: { sku: 'sku-a', mode: 'payg', schedule: 'always', qty: 1 } })],
    });

    const result = computeAttribution(resolved, [node('sql', 300)]);

    expect(result.byContainer['primary-db']).toEqual({
      container: 'primary-db',
      monthly: 150,
      unattributedByDefault: true,
      contributions: [{ resourceSlug: 'sql', share: 0.5, monthly: 150, unattributedByDefault: true }],
    });
    expect(result.byContainer['reporting-db']?.monthly).toBe(150);
    expect(result.diagnostics).toEqual([]);
  });

  it('routes a priced resource with no realizes and no attribution to the unattributed bucket', () => {
    const resolved = makeResolvedTopology({
      resources: [makeResolvedResource({ slug: 'cache', cost: { sku: 'sku-a', mode: 'payg', schedule: 'always', qty: 1 } })],
    });

    const result = computeAttribution(resolved, [node('cache', 130)]);

    expect(result.byContainer).toEqual({});
    expect(result.unattributed).toEqual({
      monthly: 130,
      entries: [{ resourceSlug: 'cache', monthly: 130, reason: 'no-realizes' }],
    });
  });

  it('ignores resources with no cost binding entirely (not attributed, not unattributed)', () => {
    const resolved = makeResolvedTopology({
      resources: [makeResolvedResource({ slug: 'vnet', realizes: [] })],
    });

    const result = computeAttribution(resolved, []);

    expect(result.byContainer).toEqual({});
    expect(result.unattributed).toEqual({ monthly: 0, entries: [] });
  });

  it('merges contributions to the same container from two different resources', () => {
    const resolved = makeResolvedTopology({
      resources: [
        makeResolvedResource({
          slug: 'app-a',
          cost: { sku: 'sku-a', mode: 'payg', schedule: 'always', qty: 1, attribution: [{ container: 'shared', share: 1 }] },
        }),
        makeResolvedResource({ slug: 'app-b', realizes: ['shared'], cost: { sku: 'sku-a', mode: 'payg', schedule: 'always', qty: 1 } }),
      ],
    });

    const result = computeAttribution(resolved, [node('app-a', 100), node('app-b', 50)]);

    expect(result.byContainer.shared?.monthly).toBe(150);
    // one explicit + one default-split contribution -> container flagged unattributedByDefault.
    expect(result.byContainer.shared?.unattributedByDefault).toBe(true);
    expect(result.byContainer.shared?.contributions).toHaveLength(2);
  });
});
