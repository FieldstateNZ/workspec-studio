import { describe, expect, it } from 'vitest';
import {
  Connection,
  EnvironmentArtifact,
  ResourceArtifact,
  ResourceKind,
  TopologyArtifact,
} from './index.js';

/** Narrows a possibly-undefined lookup/index result, failing the test loudly if absent. */
function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('expected value to be defined');
  return value;
}

// Factories (not shared fixtures): each test builds the minimal valid artifact
// it needs, then mutates one field to exercise a rule.

function makeTopology(): Record<string, unknown> {
  return {
    apiVersion: 'workspec.io/v1alpha1',
    kind: 'Topology',
    metadata: { slug: 'web-app' },
    spec: {
      title: 'Web App',
      provider: 'azure',
      environments: ['dev', 'test', 'prod'],
      defaultEnvironment: 'prod',
      connections: [{ from: 'client', to: 'app-service', class: 'primary' }],
    },
  };
}

function makeResource(): Record<string, unknown> {
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
  };
}

function makeEnvironment(): Record<string, unknown> {
  return {
    apiVersion: 'workspec.io/v1alpha1',
    kind: 'Environment',
    metadata: { slug: 'prod' },
    spec: {},
  };
}

describe('ResourceKind', () => {
  it('accepts every closed enum value and rejects an unknown one', () => {
    for (const kind of [
      'client',
      'compute',
      'function',
      'database',
      'cache',
      'endpoint',
      'monitor',
      'vnet',
      'subnet',
      'resource-group',
      'edge',
      'gateway',
      'identity',
      'search',
      'storage',
      'vault',
    ]) {
      expect(ResourceKind.safeParse(kind).success).toBe(true);
    }
    expect(ResourceKind.safeParse('server').success).toBe(false);
  });
});

describe('Connection', () => {
  it('defaults class to primary', () => {
    const res = Connection.safeParse({ from: 'a', to: 'b' });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.class).toBe('primary');
  });

  it('rejects an unknown class value', () => {
    const res = Connection.safeParse({ from: 'a', to: 'b', class: 'secondary' });
    expect(res.success).toBe(false);
  });

  it('rejects a malformed connection missing `to`', () => {
    const res = Connection.safeParse({ from: 'a' });
    expect(res.success).toBe(false);
  });
});

describe('TopologyArtifact', () => {
  it('parses a minimal valid topology', () => {
    expect(TopologyArtifact.safeParse(makeTopology()).success).toBe(true);
  });

  it('accepts an empty connections array', () => {
    const doc = makeTopology();
    (doc.spec as { connections: unknown[] }).connections = [];
    expect(TopologyArtifact.safeParse(doc).success).toBe(true);
  });

  it('rejects a defaultEnvironment not declared in environments', () => {
    const doc = makeTopology();
    (doc.spec as { defaultEnvironment: string }).defaultEnvironment = 'staging';
    const res = TopologyArtifact.safeParse(doc);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(must(res.error.issues[0]).path).toEqual(['spec', 'defaultEnvironment']);
    }
  });

  it('rejects a connection environments entry not declared on the topology', () => {
    const doc = makeTopology();
    (doc.spec as { connections: Record<string, unknown>[] }).connections = [
      { from: 'client', to: 'app-service', environments: ['staging'] },
    ];
    const res = TopologyArtifact.safeParse(doc);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.path.at(-1) === 0 && i.path.includes('environments'))).toBe(
        true,
      );
    }
  });

  it('rejects a bad-shaped environment slug', () => {
    const doc = makeTopology();
    (doc.spec as { environments: string[] }).environments = ['Dev', 'prod'];
    expect(TopologyArtifact.safeParse(doc).success).toBe(false);
  });

  it('rejects the wrong kind discriminant', () => {
    const doc = makeTopology() as { kind: string };
    doc.kind = 'Resource';
    expect(TopologyArtifact.safeParse(doc).success).toBe(false);
  });
});

describe('ResourceArtifact', () => {
  it('parses a minimal valid resource', () => {
    expect(ResourceArtifact.safeParse(makeResource()).success).toBe(true);
  });

  it('omits `environments` to mean present in all topology environments (absence is meaningful)', () => {
    const res = ResourceArtifact.safeParse(makeResource());
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.spec.environments).toBeUndefined();
  });

  it('accepts an explicit environments subset (e.g. front-door: prod only)', () => {
    const doc = makeResource();
    (doc.spec as { environments?: string[] }).environments = ['prod'];
    expect(ResourceArtifact.safeParse(doc).success).toBe(true);
  });

  it('defaults source.kind to authored and cost.qty to 1', () => {
    const doc = makeResource();
    (doc.spec as Record<string, unknown>).source = {};
    (doc.spec as Record<string, unknown>).cost = { sku: 'p1v3', mode: 'payg', schedule: 'always' };
    const res = ResourceArtifact.safeParse(doc);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.spec.source?.kind).toBe('authored');
      expect(res.data.spec.cost?.qty).toBe(1);
    }
  });

  it('rejects a resource of an unknown kind', () => {
    const doc = makeResource();
    (doc.spec as { kind: string }).kind = 'server';
    expect(ResourceArtifact.safeParse(doc).success).toBe(false);
  });

  it('rejects a cost attribution share outside 0..1', () => {
    const doc = makeResource();
    (doc.spec as Record<string, unknown>).cost = {
      sku: 'p1v3',
      mode: 'payg',
      schedule: 'always',
      attribution: [{ container: 'api-server', share: 1.5 }],
    };
    const res = ResourceArtifact.safeParse(doc);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(must(res.error.issues[0]).path).toEqual([
        'spec',
        'cost',
        'attribution',
        0,
        'share',
      ]);
    }
  });

  it('does not carry a container/isContainer boundary flag on grouping kinds', () => {
    const doc = makeResource();
    (doc.spec as { kind: string }).kind = 'vnet';
    (doc.spec as Record<string, unknown>).isContainer = true;
    const res = ResourceArtifact.safeParse(doc);
    expect(res.success).toBe(true);
    if (res.success) {
      expect((res.data.spec as Record<string, unknown>).isContainer).toBeUndefined();
    }
  });
});

describe('EnvironmentArtifact', () => {
  it('parses an environment with no fields at all', () => {
    expect(EnvironmentArtifact.safeParse(makeEnvironment()).success).toBe(true);
  });

  it('accepts an override for a resource slug not otherwise known (schema-shape-only)', () => {
    const doc = makeEnvironment();
    (doc.spec as Record<string, unknown>).overrides = {
      'nonexistent-resource': { config: { tier: 'P2v3' } },
    };
    expect(EnvironmentArtifact.safeParse(doc).success).toBe(true);
  });

  it('rejects a negative override qty', () => {
    const doc = makeEnvironment();
    (doc.spec as Record<string, unknown>).overrides = {
      'app-service': { cost: { qty: -1 } },
    };
    const res = EnvironmentArtifact.safeParse(doc);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(must(res.error.issues[0]).path).toEqual([
        'spec',
        'overrides',
        'app-service',
        'cost',
        'qty',
      ]);
    }
  });

  it('rejects a bad-shaped resourceGroupSuffix key name typo gracefully (unknown keys stripped, not errored)', () => {
    const doc = makeEnvironment();
    (doc.spec as Record<string, unknown>).naming = { resourceGroupSufix: '-dev' };
    const res = EnvironmentArtifact.safeParse(doc);
    expect(res.success).toBe(true);
  });
});
