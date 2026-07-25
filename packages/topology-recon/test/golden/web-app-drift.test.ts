import { describe, expect, it } from 'vitest';
import { reconcile } from '../../src/reconcile/reconcile.js';
import { summarizeDrift } from '../../src/reconcile/summarize-drift.js';
import {
  buildActualDerivedTopology,
  buildAuthoredResolvedTopology,
} from './web-app-drift.fixtures.js';

/**
 * GOLDEN: locks `reconcile()` (spec §4, the normative contract) against a
 * scenario exercising all four drift classes at once, matched to the
 * drift+cost design's worked example — this is the load-bearing test for the
 * whole package, the same role `web-app-resolve.test.ts` plays for
 * `@workspec/topology-model`'s `resolve()`.
 */
describe('reconcile(): web-app drift scenario, golden across all four drift classes', () => {
  it('produces the exact Drift[], sorted by class then slug', () => {
    const authored = buildAuthoredResolvedTopology();
    const actual = buildActualDerivedTopology();

    const drifts = reconcile(authored, actual, 'prod');

    expect(drifts).toEqual([
      {
        class: 'phantom',
        slug: 'search',
        message: expect.stringContaining('search'),
      },
      {
        class: 'orphan',
        slug: 'diag-storage',
        message: expect.stringContaining('diag-storage'),
      },
      {
        class: 'divergent',
        authoredSlug: 'app-service',
        actualSlug: 'app-service-01',
        message: expect.stringContaining('app-service'),
        configDiff: [{ key: 'tier', authored: 'P1v3', actual: 'P0v3' }],
        costDiff: [
          { key: 'sku', authored: 'p1v3', actual: 'p0v3' },
          { key: 'qty', authored: 2, actual: 1 },
        ],
      },
      {
        class: 'divergent',
        authoredSlug: 'cache',
        actualSlug: 'cache-01',
        message: expect.stringContaining('cache'),
        configDiff: [
          { key: 'sku', authored: 'Balanced', actual: 'Basic' },
          { key: 'tier', authored: 'B2', actual: 'C1' },
          { key: 'zoneRedundant', authored: true, actual: false },
        ],
        costDiff: [{ key: 'sku', authored: 'balanced-b2', actual: 'basic-c1' }],
      },
      {
        class: 'miswired',
        slugs: ['app-service', 'sql', 'sql-pe'],
        message: expect.stringContaining('app-service->sql'),
        edges: [
          { from: 'app-service', to: 'sql-pe', class: 'primary', side: 'authored-only' },
          { from: 'sql-pe', to: 'sql', class: 'primary', side: 'authored-only' },
          { from: 'app-service', to: 'sql', class: 'primary', side: 'actual-only' },
        ],
      },
    ]);
  });

  it('never flags client, sql, or sql-pe individually — they matched cleanly with no config/cost divergence', () => {
    const drifts = reconcile(buildAuthoredResolvedTopology(), buildActualDerivedTopology(), 'prod');
    const divergentSlugs = drifts.filter((d) => d.class === 'divergent').map((d) => d.authoredSlug);

    expect(divergentSlugs).not.toContain('client');
    expect(divergentSlugs).not.toContain('sql');
    expect(divergentSlugs).not.toContain('sql-pe');
  });

  it('summarizes to the expected per-class counts and hasDrift: true', () => {
    const drifts = reconcile(buildAuthoredResolvedTopology(), buildActualDerivedTopology(), 'prod');

    expect(summarizeDrift(drifts)).toEqual({
      countsByClass: { phantom: 1, orphan: 1, divergent: 2, miswired: 1 },
      total: 5,
      hasDrift: true,
    });
  });

  it('is deterministic: re-running on the same input yields byte-identical results', () => {
    const authored = buildAuthoredResolvedTopology();
    const actual = buildActualDerivedTopology();

    expect(reconcile(authored, actual, 'prod')).toEqual(reconcile(authored, actual, 'prod'));
  });

  it('order-invariance: shuffling both resource arrays (and reversing both connection arrays) yields byte-identical Drift[]', () => {
    const authored = buildAuthoredResolvedTopology();
    const actual = buildActualDerivedTopology();

    const shuffledAuthored = {
      ...authored,
      resources: [...authored.resources].reverse(),
      connections: [...authored.connections].reverse(),
    };
    const shuffledActual = {
      ...actual,
      resources: [...actual.resources].reverse(),
      connections: [...(actual.connections ?? [])].reverse(),
    };

    const forward = reconcile(authored, actual, 'prod');
    const shuffled = reconcile(shuffledAuthored, shuffledActual, 'prod');

    expect(shuffled).toEqual(forward);
  });

  it('reports no drift when actual is an exact mirror of authored', () => {
    const authored = buildAuthoredResolvedTopology();
    const actualResources = authored.resources.map((r) => ({
      slug: r.slug,
      name: r.name,
      kind: r.kind,
      type: r.type,
      provider: r.provider,
      resourceGroup: r.resourceGroup,
      config: r.config,
      cost: r.cost,
      source: null,
    }));

    const mirroredActual = {
      envSlug: 'prod',
      resources: actualResources,
      connections: authored.connections,
    };

    expect(reconcile(authored, mirroredActual, 'prod')).toEqual([]);
  });
});
