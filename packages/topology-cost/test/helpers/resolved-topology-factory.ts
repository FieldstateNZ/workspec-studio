import type { ResolvedResource, ResolvedTopology } from '@workspec/topology-model';

/**
 * Builds a `ResolvedResource` for unit tests, defaulted to a bare compute
 * node with no placement, no cost, and no `realizes` — override only the
 * fields the test under construction cares about.
 */
export function makeResolvedResource(
  overrides: Partial<ResolvedResource> & { slug: string },
): ResolvedResource {
  return {
    name: overrides.slug,
    kind: 'compute',
    type: 'Test resource',
    provider: 'azure',
    network: null,
    resourceGroup: null,
    realizes: [],
    config: null,
    cost: null,
    source: null,
    ...overrides,
  };
}

/**
 * Builds a `ResolvedTopology` for unit tests around a given resource list —
 * everything but `resources` defaults to an empty/no-op shape.
 */
export function makeResolvedTopology(
  overrides: Partial<ResolvedTopology> & { resources: readonly ResolvedResource[] },
): ResolvedTopology {
  return {
    envSlug: 'test',
    title: 'Test topology',
    provider: 'azure',
    catalog: null,
    connections: [],
    naming: { resourceGroupSuffix: null },
    resourceGroupNames: new Map(),
    ...overrides,
  };
}
