import { describe, expect, it } from 'vitest';
import { createMemoryRepository, TOPOLOGY_REPOSITORY_METHODS } from './repository.js';
import type { TopologyRepositoryPort } from './repository.js';
import type { Environment } from './environment.js';
import type { Resource } from './resource.js';
import type { Topology } from './topology.js';
import type { Layout } from './schemas/layout/layout.js';

/** Narrows a possibly-undefined lookup/index result, failing the test loudly if absent. */
function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('expected value to be defined');
  return value;
}

// ── Fixtures are factory-built, never shared mutable module state ─────────

function makeTopology(): Topology {
  return {
    apiVersion: 'workspec.io/v1alpha1',
    kind: 'Topology',
    metadata: { slug: 'web-app' },
    spec: {
      title: 'Web App',
      provider: 'azure',
      environments: ['dev', 'prod'],
      defaultEnvironment: 'prod',
      connections: [{ from: 'client', to: 'app-service', class: 'primary' }],
    },
  } as Topology;
}

function makeResource(): Resource {
  return {
    apiVersion: 'workspec.io/v1alpha1',
    kind: 'Resource',
    metadata: { slug: 'app-service' },
    spec: {
      name: 'Web App Service',
      kind: 'compute',
      type: 'Azure App Service',
      provider: 'azure',
    },
  } as Resource;
}

function makeEnvironment(): Environment {
  return {
    apiVersion: 'workspec.io/v1alpha1',
    kind: 'Environment',
    metadata: { slug: 'prod' },
    spec: {},
  } as Environment;
}

function makeLayout(): Layout {
  return { version: 1, nodes: { 'app-service': { positions: { network: { x: 0, y: 0 } } } } };
}

describe('TopologyRepositoryPort surface', () => {
  it('names exactly the eleven methods', () => {
    expect(TOPOLOGY_REPOSITORY_METHODS).toHaveLength(11);
    expect([...TOPOLOGY_REPOSITORY_METHODS].sort()).toEqual([
      'listEnvironments',
      'listResources',
      'listTopologies',
      'readEnvironment',
      'readLayout',
      'readResource',
      'readTopology',
      'writeEnvironment',
      'writeLayout',
      'writeResource',
      'writeTopology',
    ]);
  });

  it('the memory implementation exposes exactly the eleven port methods and no more', () => {
    const repo = createMemoryRepository();
    expect(Object.keys(repo).sort()).toEqual([...TOPOLOGY_REPOSITORY_METHODS].sort());
  });

  it('is type-compatible with TopologyRepositoryPort (compile-time conformance)', () => {
    // A typed record whose keys are exactly `keyof TopologyRepositoryPort`: adding
    // a twelfth method to the port (or removing one) breaks this literal.
    const surface: Record<keyof TopologyRepositoryPort, true> = {
      listTopologies: true,
      readTopology: true,
      writeTopology: true,
      listResources: true,
      readResource: true,
      writeResource: true,
      listEnvironments: true,
      readEnvironment: true,
      writeEnvironment: true,
      readLayout: true,
      writeLayout: true,
    };
    expect(Object.keys(surface)).toHaveLength(11);
    const repo: TopologyRepositoryPort = createMemoryRepository();
    expect(repo).toBeDefined();
  });
});

describe('createMemoryRepository', () => {
  it('lists seeded topologies with { ref, slug, title }', async () => {
    const repo = createMemoryRepository({ topologies: { 'a.topology.yaml': makeTopology() } });
    const list = await repo.listTopologies();
    expect(list).toEqual([{ ref: 'a.topology.yaml', slug: 'web-app', title: 'Web App' }]);
  });

  it('lists seeded resources with { ref, slug, title }', async () => {
    const repo = createMemoryRepository({ resources: { 'a.resource.yaml': makeResource() } });
    const list = await repo.listResources();
    expect(list).toEqual([
      { ref: 'a.resource.yaml', slug: 'app-service', title: 'Web App Service' },
    ]);
  });

  it('lists seeded environments with { ref, slug } (no title field)', async () => {
    const repo = createMemoryRepository({
      environments: { 'a.environment.yaml': makeEnvironment() },
    });
    const list = await repo.listEnvironments();
    expect(list).toEqual([{ ref: 'a.environment.yaml', slug: 'prod' }]);
  });

  it('round-trips a written topology', async () => {
    const repo = createMemoryRepository();
    await repo.writeTopology('t.topology.yaml', makeTopology());
    const read = await repo.readTopology('t.topology.yaml');
    expect(read.metadata.slug).toBe('web-app');
    expect(await repo.listTopologies()).toHaveLength(1);
  });

  it('rejects reads of unknown refs', async () => {
    const repo = createMemoryRepository();
    await expect(repo.readTopology('missing.topology.yaml')).rejects.toThrow(/no topology/);
    await expect(repo.readResource('missing.resource.yaml')).rejects.toThrow(/no resource/);
    await expect(repo.readEnvironment('missing.environment.yaml')).rejects.toThrow(
      /no environment/,
    );
  });

  it('validates through Zod on write', async () => {
    const repo = createMemoryRepository();
    const bad = makeTopology();
    // Corrupt a required invariant: defaultEnvironment not declared in environments.
    (bad.spec as { defaultEnvironment: string }).defaultEnvironment = 'staging';
    await expect(repo.writeTopology('bad.topology.yaml', bad)).rejects.toThrow(
      /invalid topology/,
    );
  });

  it('returns deep clones so external mutation cannot corrupt the store', async () => {
    const repo = createMemoryRepository({ topologies: { 'a.topology.yaml': makeTopology() } });
    const first = await repo.readTopology('a.topology.yaml');
    first.spec.title = 'MUTATED';
    const second = await repo.readTopology('a.topology.yaml');
    expect(second.spec.title).toBe('Web App');
  });

  it('is isolated per factory call (no shared fixture)', async () => {
    const a = createMemoryRepository({ topologies: { 'x.topology.yaml': makeTopology() } });
    const b = createMemoryRepository();
    expect(await a.listTopologies()).toHaveLength(1);
    expect(await b.listTopologies()).toHaveLength(0);
  });

  it('resolves undefined for a topology with no layout file', async () => {
    const repo = createMemoryRepository();
    expect(await repo.readLayout('web-app')).toBeUndefined();
  });

  it('round-trips a written layout, keyed by topology slug (not an opaque ref)', async () => {
    const repo = createMemoryRepository();
    await repo.writeLayout('web-app', makeLayout());
    const read = await repo.readLayout('web-app');
    expect(read).toEqual(makeLayout());
  });

  it('lists seeded layouts and validates them through Zod on write', async () => {
    const repo = createMemoryRepository({ layouts: { 'web-app': makeLayout() } });
    expect(await repo.readLayout('web-app')).toEqual(makeLayout());
    const bad = { version: 2, nodes: {} } as unknown as Layout;
    await expect(repo.writeLayout('web-app', bad)).rejects.toThrow(/invalid layout/);
  });

  it('layout reads return deep clones', async () => {
    const repo = createMemoryRepository({ layouts: { 'web-app': makeLayout() } });
    const first = must(await repo.readLayout('web-app'));
    first.nodes['app-service'] = { positions: { rg: { x: 999, y: 999 } } };
    const second = must(await repo.readLayout('web-app'));
    expect(second.nodes['app-service']).toEqual({ positions: { network: { x: 0, y: 0 } } });
  });
});
