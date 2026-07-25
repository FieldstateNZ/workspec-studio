import { describe, expect, it } from 'vitest';
import { DIAGNOSTIC_CODES } from '../../src/model/diagnostic-codes.js';
import { loadTopologyModel } from '../../src/load-topology-model.js';
import { createMemorySource } from '../../src/sources/memory-source.js';

describe('no-topology', () => {
  it('flags an empty tree (or one with only resources) as having no topology file', async () => {
    const model = await loadTopologyModel(
      createMemorySource({
        '.workspec/resources/client.yaml':
          'apiVersion: workspec.io/v1alpha1\nkind: Resource\nmetadata: {}\nspec:\n  name: Client\n  kind: client\n  type: Browser\n  provider: azure\n',
      }),
    );

    expect(model.topology).toBeNull();
    expect(model.diagnostics).toEqual([
      expect.objectContaining({ severity: 'error', code: DIAGNOSTIC_CODES.noTopology, file: '' }),
    ]);
  });

  it('an entirely empty tree loads cleanly except for the missing topology', async () => {
    const model = await loadTopologyModel(createMemorySource({}));
    expect(model.topology).toBeNull();
    expect(model.resources.size).toBe(0);
    expect(model.environments.size).toBe(0);
    expect(model.layout).toBeNull();
    expect(model.diagnostics).toEqual([
      expect.objectContaining({ code: DIAGNOSTIC_CODES.noTopology }),
    ]);
  });
});

describe('multiple-topologies', () => {
  it('flags more than one topology file and deterministically falls back to the lexicographically-first slug', async () => {
    const topologyYaml = (title: string): string =>
      `apiVersion: workspec.io/v1alpha1\nkind: Topology\nmetadata: {}\nspec:\n  title: ${title}\n  provider: azure\n  environments: [prod]\n  defaultEnvironment: prod\n  connections: []\n`;

    const model = await loadTopologyModel(
      createMemorySource({
        '.workspec/topologies/zulu.yaml': topologyYaml('Zulu'),
        '.workspec/topologies/alpha.yaml': topologyYaml('Alpha'),
        '.workspec/environments/prod.yaml':
          'apiVersion: workspec.io/v1alpha1\nkind: Environment\nmetadata: {}\nspec: {}\n',
      }),
    );

    expect(model.topology?.slug).toBe('alpha');
    expect(model.diagnostics).toEqual([
      expect.objectContaining({ severity: 'error', code: DIAGNOSTIC_CODES.multipleTopologies, file: '' }),
    ]);
  });
});
