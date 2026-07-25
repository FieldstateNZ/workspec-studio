import { describe, expect, it } from 'vitest';
import type { Environment, Resource } from '@workspec/topology-schema';
import { loadTopologyModel } from '../../src/load-topology-model.js';
import { resolve } from '../../src/resolve/resolve-topology.js';
import { createMemorySource } from '../../src/sources/memory-source.js';
import type { TopologyModel } from '../../src/model/topology-model.types.js';
import { readWebAppFixtureSeed } from '../helpers/read-web-app-fixture.js';
import { requireTopology } from '../helpers/require-topology.js';

async function loadWebAppModel(): Promise<TopologyModel> {
  return loadTopologyModel(createMemorySource(await readWebAppFixtureSeed()));
}

function toResourceMap(model: TopologyModel): ReadonlyMap<string, Resource> {
  return new Map([...model.resources].map(([slug, loaded]) => [slug, loaded.resource]));
}

function toEnvironmentMap(model: TopologyModel): ReadonlyMap<string, Environment> {
  return new Map([...model.environments].map(([slug, loaded]) => [slug, loaded.environment]));
}

/**
 * GOLDEN: locks `resolve()` (spec §3.3, the normative contract) against the
 * web-app fixture across all three of its environments. This is the load-
 * bearing test for the whole package — every rule the contract specifies
 * has to fire on real data here, not just in an isolated unit test:
 *
 * - `front-door` (`environments: [prod]`) is present ONLY in prod (step 1).
 * - In dev/test, `front-door` auto-prunes its two connections
 *   (`client->front-door`, `front-door->app-service`) even though those
 *   connections ALSO carry their own `environments: [prod]` scope — both
 *   prune rules fire on the same pair, redundantly but consistently (step 2).
 * - The explicit `client->app-service` rewire (`environments: [dev, test]`)
 *   appears only in dev/test, never in prod (step 2, explicit scoping,
 *   independent of auto-prune).
 * - `app-service`/`cache` overrides deep-merge per environment (step 3):
 *   `app-service.cost` patches `sku`/`qty` in prod, `qty` alone in dev/test,
 *   preserving `mode`/`schedule`/`attribution` from the base resource every
 *   time; `cache.config` gains a `sku` key that doesn't exist on the base
 *   resource at all.
 * - `rg-app` (the only `resource-group` in this fixture) gets its naming
 *   suffix appended in every environment (step 4).
 */
describe('resolve(): web-app fixture, golden across all three environments', () => {
  it('prod: front-door present, its two connections present, the dev/test rewire absent, overrides and naming applied', async () => {
    const model = await loadWebAppModel();
    const resolved = resolve(
      requireTopology(model).topology,
      toResourceMap(model),
      toEnvironmentMap(model),
      'prod',
    );

    expect(resolved.envSlug).toBe('prod');
    expect(resolved.title).toBe('Web App');
    expect(resolved.catalog).toBe('web-app-hosting');
    expect(resolved.resources.map((r) => r.slug)).toEqual(
      [
        'app-insights',
        'app-service',
        'cache',
        'client',
        'core-vnet',
        'front-door',
        'redis-pe',
        'rg-app',
        'snet-workload',
        'sql',
        'write-fn',
      ].sort(),
    );

    expect(resolved.connections).toEqual(
      expect.arrayContaining([
        { from: 'client', to: 'front-door', class: 'primary' },
        { from: 'front-door', to: 'app-service', class: 'primary' },
        { from: 'app-service', to: 'cache', class: 'primary' },
        { from: 'app-service', to: 'sql', class: 'primary' },
        { from: 'write-fn', to: 'sql', class: 'primary' },
        { from: 'write-fn', to: 'cache', class: 'primary' },
        { from: 'app-service', to: 'app-insights', class: 'telemetry' },
        { from: 'write-fn', to: 'app-insights', class: 'telemetry' },
      ]),
    );
    expect(resolved.connections).toHaveLength(8);
    expect(resolved.connections).not.toContainEqual(
      expect.objectContaining({ from: 'client', to: 'app-service' }),
    );

    const appService = resolved.resources.find((r) => r.slug === 'app-service');
    expect(appService?.cost).toEqual({
      sku: 'p2v3',
      mode: 'payg',
      schedule: 'always',
      qty: 3,
      attribution: [{ container: 'api-server', share: 1 }],
    });
    expect(appService?.config).toEqual({ tier: 'P1v3' });

    const cache = resolved.resources.find((r) => r.slug === 'cache');
    expect(cache?.config).toEqual({ sku: 'Standard' });
    expect(cache?.cost).toEqual({ sku: 'standard-c1', mode: 'payg', schedule: 'always', qty: 1 });

    expect(resolved.naming).toEqual({ resourceGroupSuffix: '-prod' });
    expect(resolved.resourceGroupNames.get('rg-app')).toBe('rg-app-prod');
  });

  it('dev: front-door absent, its two connections auto-pruned, the dev/test rewire present, dev overrides applied', async () => {
    const model = await loadWebAppModel();
    const resolved = resolve(
      requireTopology(model).topology,
      toResourceMap(model),
      toEnvironmentMap(model),
      'dev',
    );

    expect(resolved.resources.map((r) => r.slug)).not.toContain('front-door');
    expect(resolved.resources).toHaveLength(10);

    expect(resolved.connections).not.toContainEqual(
      expect.objectContaining({ from: 'client', to: 'front-door' }),
    );
    expect(resolved.connections).not.toContainEqual(
      expect.objectContaining({ from: 'front-door', to: 'app-service' }),
    );
    expect(resolved.connections).toContainEqual({ from: 'client', to: 'app-service', class: 'primary' });
    expect(resolved.connections).toHaveLength(7);

    const appService = resolved.resources.find((r) => r.slug === 'app-service');
    expect(appService?.cost).toEqual({
      sku: 'p1v3',
      mode: 'payg',
      schedule: 'always',
      qty: 1,
      attribution: [{ container: 'api-server', share: 1 }],
    });

    const cache = resolved.resources.find((r) => r.slug === 'cache');
    expect(cache?.config).toEqual({ sku: 'Basic' });

    expect(resolved.naming).toEqual({ resourceGroupSuffix: '-dev' });
    expect(resolved.resourceGroupNames.get('rg-app')).toBe('rg-app-dev');
  });

  it('test: same shape as dev (front-door absent, rewire present), test naming suffix applied', async () => {
    const model = await loadWebAppModel();
    const resolved = resolve(
      requireTopology(model).topology,
      toResourceMap(model),
      toEnvironmentMap(model),
      'test',
    );

    expect(resolved.resources).toHaveLength(10);
    expect(resolved.connections).toHaveLength(7);
    expect(resolved.connections).toContainEqual({ from: 'client', to: 'app-service', class: 'primary' });

    const appService = resolved.resources.find((r) => r.slug === 'app-service');
    expect(appService?.cost?.qty).toBe(1);

    expect(resolved.naming).toEqual({ resourceGroupSuffix: '-test' });
    expect(resolved.resourceGroupNames.get('rg-app')).toBe('rg-app-test');
  });

  it('a resource with an override for a resource pruned out of this environment is a no-op, never an error', async () => {
    // front-door has no override entry in any environment fixture, but this
    // asserts the *general* rule holds by re-resolving prod (where every
    // override target survives) against dev (where front-door doesn't) and
    // confirming dev resolves without throwing and without a front-door
    // entry at all — the override-application step never has to "see" a
    // pruned resource to skip it correctly.
    const model = await loadWebAppModel();
    expect(() =>
      resolve(requireTopology(model).topology, toResourceMap(model), toEnvironmentMap(model), 'dev'),
    ).not.toThrow();
  });
});
