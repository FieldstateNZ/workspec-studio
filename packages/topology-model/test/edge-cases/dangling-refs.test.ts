import { describe, expect, it } from 'vitest';
import { DIAGNOSTIC_CODES } from '../../src/model/diagnostic-codes.js';
import { loadTopologyModel } from '../../src/load-topology-model.js';
import { createMemorySource } from '../../src/sources/memory-source.js';

const TOPOLOGY = (connections: string): string =>
  `apiVersion: workspec.io/v1alpha1\nkind: Topology\nmetadata: {}\nspec:\n  title: T\n  provider: azure\n  environments: [prod]\n  defaultEnvironment: prod\n${connections}\n`;

const RESOURCE = (kind: string, extra = ''): string =>
  `apiVersion: workspec.io/v1alpha1\nkind: Resource\nmetadata: {}\nspec:\n  name: R\n  kind: ${kind}\n  type: T\n  provider: azure\n${extra}`;

describe('dangling-ref: connections', () => {
  it('flags a connection endpoint that does not resolve to any resource file', async () => {
    const model = await loadTopologyModel(
      createMemorySource({
        '.workspec/topologies/t.yaml': TOPOLOGY(
          '  connections:\n    - from: ghost\n      to: also-ghost\n',
        ),
        '.workspec/environments/prod.yaml':
          'apiVersion: workspec.io/v1alpha1\nkind: Environment\nmetadata: {}\nspec: {}\n',
      }),
    );

    const danglers = model.diagnostics.filter((d) => d.code === DIAGNOSTIC_CODES.danglingRef);
    expect(danglers).toHaveLength(2);
    expect(danglers.map((d) => d.refSlug).sort()).toEqual(['also-ghost', 'ghost']);
    expect(danglers[0]).toMatchObject({ severity: 'error', file: '.workspec/topologies/t.yaml' });
    expect(danglers[0]?.line).toBeGreaterThan(0);
  });
});

describe('dangling-ref: placement refs', () => {
  it('flags a resource network/resourceGroup ref that does not resolve to any resource file', async () => {
    const model = await loadTopologyModel(
      createMemorySource({
        '.workspec/topologies/t.yaml': TOPOLOGY('  connections: []\n'),
        '.workspec/resources/app.yaml': RESOURCE('compute', '  network: ghost-subnet\n'),
        '.workspec/environments/prod.yaml':
          'apiVersion: workspec.io/v1alpha1\nkind: Environment\nmetadata: {}\nspec: {}\n',
      }),
    );

    const danglers = model.diagnostics.filter((d) => d.code === DIAGNOSTIC_CODES.danglingRef);
    expect(danglers).toEqual([
      expect.objectContaining({
        severity: 'error',
        file: '.workspec/resources/app.yaml',
        refSlug: 'ghost-subnet',
      }),
    ]);
  });
});

describe('non-grouping-placement', () => {
  it('flags a network ref that resolves, but to a resource that is not a vnet/subnet', async () => {
    const model = await loadTopologyModel(
      createMemorySource({
        '.workspec/topologies/t.yaml': TOPOLOGY('  connections: []\n'),
        '.workspec/resources/app.yaml': RESOURCE('compute', '  network: cache\n'),
        '.workspec/resources/cache.yaml': RESOURCE('cache'),
        '.workspec/environments/prod.yaml':
          'apiVersion: workspec.io/v1alpha1\nkind: Environment\nmetadata: {}\nspec: {}\n',
      }),
    );

    expect(model.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'warning',
        code: DIAGNOSTIC_CODES.nonGroupingPlacement,
        file: '.workspec/resources/app.yaml',
        refSlug: 'cache',
      }),
    ]);
  });

  it('does not flag a network ref that resolves to a vnet, or a resourceGroup ref that resolves to a resource-group', async () => {
    const model = await loadTopologyModel(
      createMemorySource({
        '.workspec/topologies/t.yaml': TOPOLOGY('  connections: []\n'),
        '.workspec/resources/app.yaml': RESOURCE('compute', '  network: vnet1\n  resourceGroup: rg1\n'),
        '.workspec/resources/vnet1.yaml': RESOURCE('vnet'),
        '.workspec/resources/rg1.yaml': RESOURCE('resource-group'),
        '.workspec/environments/prod.yaml':
          'apiVersion: workspec.io/v1alpha1\nkind: Environment\nmetadata: {}\nspec: {}\n',
      }),
    );

    expect(model.diagnostics.filter((d) => d.code === DIAGNOSTIC_CODES.nonGroupingPlacement)).toEqual([]);
    expect(model.diagnostics.filter((d) => d.code === DIAGNOSTIC_CODES.danglingRef)).toEqual([]);
  });
});

describe('dangling-environment-ref', () => {
  it('flags a declared environment slug with no matching environment file', async () => {
    const model = await loadTopologyModel(
      createMemorySource({
        '.workspec/topologies/t.yaml': TOPOLOGY('  connections: []\n'),
      }),
    );

    expect(model.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        code: DIAGNOSTIC_CODES.danglingEnvironmentRef,
        refSlug: 'prod',
      }),
    );
  });
});

describe('dangling-catalog-ref', () => {
  it('flags a catalog ref with no matching catalog file', async () => {
    const model = await loadTopologyModel(
      createMemorySource({
        '.workspec/topologies/t.yaml':
          `apiVersion: workspec.io/v1alpha1\nkind: Topology\nmetadata: {}\nspec:\n  title: T\n  provider: azure\n  environments: [prod]\n  defaultEnvironment: prod\n  catalog: missing-catalog\n  connections: []\n`,
        '.workspec/environments/prod.yaml':
          'apiVersion: workspec.io/v1alpha1\nkind: Environment\nmetadata: {}\nspec: {}\n',
      }),
    );

    expect(model.diagnostics).toContainEqual(
      expect.objectContaining({ severity: 'warning', code: DIAGNOSTIC_CODES.danglingCatalogRef, refSlug: 'missing-catalog' }),
    );
  });

  it('does not flag when the catalog file is present', async () => {
    const model = await loadTopologyModel(
      createMemorySource({
        '.workspec/topologies/t.yaml':
          `apiVersion: workspec.io/v1alpha1\nkind: Topology\nmetadata: {}\nspec:\n  title: T\n  provider: azure\n  environments: [prod]\n  defaultEnvironment: prod\n  catalog: present-catalog\n  connections: []\n`,
        '.workspec/environments/prod.yaml':
          'apiVersion: workspec.io/v1alpha1\nkind: Environment\nmetadata: {}\nspec: {}\n',
        '.workspec/catalogs/present-catalog.yaml': 'anything',
      }),
    );

    expect(model.diagnostics.filter((d) => d.code === DIAGNOSTIC_CODES.danglingCatalogRef)).toEqual([]);
  });
});
