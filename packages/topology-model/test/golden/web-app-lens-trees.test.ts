import { describe, expect, it } from 'vitest';
import type { Environment, Resource } from '@workspec/topology-schema';
import { buildNetworkTree } from '../../src/lenses/build-network-tree.js';
import { buildResourceGroupTree } from '../../src/lenses/build-resource-group-tree.js';
import { loadTopologyModel } from '../../src/load-topology-model.js';
import { resolve } from '../../src/resolve/resolve-topology.js';
import { createMemorySource } from '../../src/sources/memory-source.js';
import type { LensEntry, LensTree } from '../../src/model/lens-tree.types.js';
import type { TopologyModel } from '../../src/model/topology-model.types.js';
import { readWebAppFixtureSeed } from '../helpers/read-web-app-fixture.js';
import { requireTopology } from '../helpers/require-topology.js';

function toResourceMap(model: TopologyModel): ReadonlyMap<string, Resource> {
  return new Map([...model.resources].map(([slug, loaded]) => [slug, loaded.resource]));
}

function toEnvironmentMap(model: TopologyModel): ReadonlyMap<string, Environment> {
  return new Map([...model.environments].map(([slug, loaded]) => [slug, loaded.environment]));
}

function findEntry(tree: LensTree, slug: string): LensEntry | undefined {
  function search(entries: readonly LensEntry[]): LensEntry | undefined {
    for (const entry of entries) {
      const entrySlug = entry.type === 'container' ? entry.container.slug : entry.node.slug;
      if (entrySlug === slug) return entry;
      if (entry.type === 'container') {
        const found = search(entry.container.children);
        if (found) return found;
      }
    }
    return undefined;
  }
  return search(tree.roots);
}

/**
 * GOLDEN: locks the spec §3.2 grouping-kind rule against the web-app
 * fixture's prod resolution — `core-vnet`/`snet-workload` (both grouping
 * kinds) must render as container boxes in the network lens and as plain
 * NODES in the resource-group lens (the design's `RG_NODES` behaviour,
 * falling out of the shared rule rather than a special case); `rg-app`
 * (also a grouping kind) must render as the container box in the
 * resource-group lens and as a plain node in the network lens.
 */
describe('lens trees: web-app fixture (prod), golden grouping-kind-as-container-in-own-lens', () => {
  it('network lens: core-vnet and snet-workload are nested containers; rg-app is a plain node', async () => {
    const model = await loadTopologyModel(createMemorySource(await readWebAppFixtureSeed()));
    const resolved = resolve(requireTopology(model).topology, toResourceMap(model), toEnvironmentMap(model), 'prod');
    const tree = buildNetworkTree(resolved);

    expect(tree.lens).toBe('network');
    expect(tree.counts).toEqual({ resources: 11, containersByKind: { vnet: 1, subnet: 1 } });

    const coreVnet = findEntry(tree, 'core-vnet');
    expect(coreVnet?.type).toBe('container');
    const snetWorkload = coreVnet?.type === 'container'
      ? coreVnet.container.children.find((c) => (c.type === 'container' ? c.container.slug : c.node.slug) === 'snet-workload')
      : undefined;
    expect(snetWorkload?.type).toBe('container');
    if (snetWorkload?.type === 'container') {
      expect(snetWorkload.container.children.map((c) => (c.type === 'node' ? c.node.slug : c.container.slug)).sort()).toEqual(
        ['app-service', 'cache', 'redis-pe', 'sql', 'write-fn'],
      );
      expect(snetWorkload.container.children.every((c) => c.type === 'node')).toBe(true);
    }

    // rg-app is a grouping kind, but NOT for the network lens — plain node.
    const rgApp = findEntry(tree, 'rg-app');
    expect(rgApp?.type).toBe('node');

    // Resources with no `network` ref sit outside the vnet, at the top level.
    const topLevelSlugs = tree.roots.map((entry) => (entry.type === 'container' ? entry.container.slug : entry.node.slug));
    expect(topLevelSlugs.sort()).toEqual(['app-insights', 'client', 'core-vnet', 'front-door', 'rg-app']);
  });

  it('resource-group lens: rg-app is the container; core-vnet and snet-workload are plain nodes inside it (RG_NODES)', async () => {
    const model = await loadTopologyModel(createMemorySource(await readWebAppFixtureSeed()));
    const resolved = resolve(requireTopology(model).topology, toResourceMap(model), toEnvironmentMap(model), 'prod');
    const tree = buildResourceGroupTree(resolved);

    expect(tree.lens).toBe('rg');
    expect(tree.counts).toEqual({ resources: 11, containersByKind: { 'resource-group': 1 } });

    const rgApp = findEntry(tree, 'rg-app');
    expect(rgApp?.type).toBe('container');
    if (rgApp?.type === 'container') {
      expect(rgApp.container.name).toBe('rg-app-prod');
      const childSlugs = rgApp.container.children.map((c) => (c.type === 'node' ? c.node.slug : c.container.slug)).sort();
      expect(childSlugs).toEqual([
        'app-insights',
        'app-service',
        'cache',
        'core-vnet',
        'front-door',
        'redis-pe',
        'snet-workload',
        'sql',
        'write-fn',
      ]);
      // Every child renders as an ordinary NODE here, including the two
      // network-lens grouping-kind resources — this IS the RG_NODES rule,
      // falling out of `isGroupingKindForLens` alone.
      expect(rgApp.container.children.every((c) => c.type === 'node')).toBe(true);
    }

    // `client` has no `resourceGroup` ref — sits at the top level.
    const client = findEntry(tree, 'client');
    expect(client?.type).toBe('node');
    expect(tree.roots.some((entry) => entry.type === 'container' && entry.container.slug === 'rg-app')).toBe(true);
    expect(tree.roots).toHaveLength(2); // rg-app container + client node
  });

  it('dev: front-door absent from both lenses; counts drop to 10', async () => {
    const model = await loadTopologyModel(createMemorySource(await readWebAppFixtureSeed()));
    const resolved = resolve(requireTopology(model).topology, toResourceMap(model), toEnvironmentMap(model), 'dev');

    const network = buildNetworkTree(resolved);
    expect(network.counts.resources).toBe(10);
    expect(findEntry(network, 'front-door')).toBeUndefined();

    const rg = buildResourceGroupTree(resolved);
    expect(rg.counts.resources).toBe(10);
    expect(findEntry(rg, 'front-door')).toBeUndefined();
    const rgApp = findEntry(rg, 'rg-app');
    expect(rgApp?.type === 'container' ? rgApp.container.name : null).toBe('rg-app-dev');
  });
});
