import { describe, expect, it } from 'vitest';
import type { ResolvedResource, ResolvedTopology } from '@workspec/topology-model';
import type { DerivedResource, DerivedTopology } from '../model/derived-topology.types.js';
import { reconcile } from './reconcile.js';

function resource(overrides: Partial<ResolvedResource> = {}): ResolvedResource {
  return {
    slug: 'app-service',
    name: 'App Service',
    kind: 'compute',
    type: 'Azure App Service',
    provider: 'azure',
    network: null,
    resourceGroup: 'rg-app',
    realizes: [],
    config: null,
    cost: null,
    source: null,
    ...overrides,
  };
}

function derivedResource(overrides: Partial<DerivedResource> = {}): DerivedResource {
  return {
    slug: 'app-service',
    name: 'App Service',
    kind: 'compute',
    type: 'Azure App Service',
    provider: 'azure',
    resourceGroup: 'rg-app',
    config: null,
    cost: null,
    source: null,
    ...overrides,
  };
}

function authoredTopology(resources: readonly ResolvedResource[]): ResolvedTopology {
  return {
    envSlug: 'prod',
    title: 'Test',
    provider: 'azure',
    catalog: null,
    resources,
    connections: [],
    naming: { resourceGroupSuffix: null },
    resourceGroupNames: new Map(),
  };
}

function actualTopology(resources: readonly DerivedResource[]): DerivedTopology {
  return { envSlug: 'prod', resources, connections: [] };
}

describe('reconcile', () => {
  it('returns no drift when authored and actual are identical', () => {
    expect(
      reconcile(authoredTopology([resource()]), actualTopology([derivedResource()]), 'prod'),
    ).toEqual([]);
  });

  it('reports an unmatched authored resource as phantom', () => {
    const result = reconcile(
      authoredTopology([resource({ slug: 'search', kind: 'search' })]),
      actualTopology([]),
      'prod',
    );

    expect(result).toEqual([expect.objectContaining({ class: 'phantom', slug: 'search' })]);
  });

  it('reports an unmatched actual resource as orphan', () => {
    const result = reconcile(
      authoredTopology([]),
      actualTopology([derivedResource({ slug: 'diag-storage', kind: 'storage' })]),
      'prod',
    );

    expect(result).toEqual([expect.objectContaining({ class: 'orphan', slug: 'diag-storage' })]);
  });

  it('reports a matched pair with differing config/cost as divergent, with the specific differing keys', () => {
    const authored = resource({
      config: { tier: 'P1v3' },
      cost: { sku: 'p1v3', mode: 'payg', schedule: 'always', qty: 2 },
    });
    const actual = derivedResource({
      config: { tier: 'P0v3' },
      cost: { sku: 'p0v3', mode: 'payg', schedule: 'always', qty: 1 },
    });

    const result = reconcile(authoredTopology([authored]), actualTopology([actual]), 'prod');

    expect(result).toEqual([
      {
        class: 'divergent',
        authoredSlug: 'app-service',
        actualSlug: 'app-service',
        message: expect.stringContaining('app-service'),
        configDiff: [{ key: 'tier', authored: 'P1v3', actual: 'P0v3' }],
        costDiff: [
          { key: 'sku', authored: 'p1v3', actual: 'p0v3' },
          { key: 'qty', authored: 2, actual: 1 },
        ],
      },
    ]);
  });

  it('never throws and stays deterministic across repeated calls on the same input', () => {
    const authored = authoredTopology([resource({ slug: 'search', kind: 'search' })]);
    const actual = actualTopology([derivedResource({ slug: 'diag-storage', kind: 'storage' })]);

    const first = reconcile(authored, actual, 'prod');
    const second = reconcile(authored, actual, 'prod');

    expect(first).toEqual(second);
  });

  it('maximum-cardinality matcher fix: the a1/a2/x1/x2 case now matches fully, with ZERO drift', () => {
    // Same scenario as match-resources.test.ts's maximum-cardinality test,
    // asserted at the reconcile() level: a greedy matcher would strand a2/x2
    // as a false phantom+orphan pair even though a perfect matching exists.
    const a1 = resource({ slug: 'a1', resourceGroup: null, source: null });
    const a2 = resource({ slug: 'a2', resourceGroup: 'r1', source: null });
    const x1 = derivedResource({ slug: 'x1', resourceGroup: null, source: null });
    const x2 = derivedResource({ slug: 'x2', resourceGroup: 'r2', source: null });

    const result = reconcile(authoredTopology([a1, a2]), actualTopology([x1, x2]), 'prod');

    expect(result).toEqual([]);
  });

  it('connectivity unknown (actual.connections undefined): reports zero miswired drift even though authored declares edges, while phantom/orphan/divergent are unaffected', () => {
    const authored: ResolvedTopology = {
      ...authoredTopology([resource(), resource({ slug: 'search', kind: 'search' })]),
      connections: [{ from: 'app-service', to: 'search', class: 'primary' }],
    };
    // `connections` is omitted entirely (not set to `[]`) — exactly the
    // adapter-import case: connectivity was never captured for this
    // environment, so `reconcile()` must not assess wiring at all.
    const actual: DerivedTopology = {
      envSlug: 'prod',
      resources: [derivedResource(), derivedResource({ slug: 'diag-storage', kind: 'storage' })],
    };

    const result = reconcile(authored, actual, 'prod');

    expect(result.filter((d) => d.class === 'miswired')).toEqual([]);
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ class: 'phantom', slug: 'search' }),
        expect.objectContaining({ class: 'orphan', slug: 'diag-storage' }),
      ]),
    );
  });

  it('order-invariance: shuffling the authored/actual resource and connection arrays yields an identical Drift[]', () => {
    const search = resource({
      slug: 'search',
      kind: 'search',
      type: 'Azure AI Search',
      name: 'Search',
    });
    const appService = resource({
      slug: 'app-service',
      config: { tier: 'P1v3' },
      cost: { sku: 'p1v3', mode: 'payg', schedule: 'always', qty: 2 },
    });
    const cache = resource({
      slug: 'cache',
      kind: 'cache',
      type: 'Azure Cache for Redis',
      name: 'Cache',
    });

    const appServiceActual = derivedResource({
      config: { tier: 'P0v3' },
      cost: { sku: 'p0v3', mode: 'payg', schedule: 'always', qty: 1 },
    });
    const cacheActual = derivedResource({
      slug: 'cache',
      kind: 'cache',
      type: 'Azure Cache for Redis',
      name: 'Cache',
    });
    const diagStorage = derivedResource({
      slug: 'diag-storage',
      kind: 'storage',
      type: 'Azure Storage Account',
      name: 'Diag',
    });

    const authoredConnections = [
      { from: 'app-service', to: 'cache', class: 'primary' as const },
      { from: 'app-service', to: 'search', class: 'telemetry' as const },
    ];
    const actualConnections = [{ from: 'app-service', to: 'cache', class: 'primary' as const }];

    const forward = reconcile(
      { ...authoredTopology([appService, search, cache]), connections: authoredConnections },
      {
        envSlug: 'prod',
        resources: [appServiceActual, cacheActual, diagStorage],
        connections: actualConnections,
      },
      'prod',
    );
    const shuffled = reconcile(
      {
        ...authoredTopology([cache, appService, search]),
        connections: [...authoredConnections].reverse(),
      },
      {
        envSlug: 'prod',
        resources: [diagStorage, cacheActual, appServiceActual],
        connections: [...actualConnections],
      },
      'prod',
    );

    expect(shuffled).toEqual(forward);
    expect(forward.length).toBeGreaterThan(0); // sanity: this is exercising real drift, not a vacuous empty-array comparison
  });
});
