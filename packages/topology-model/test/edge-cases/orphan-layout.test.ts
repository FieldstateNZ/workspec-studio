import { describe, expect, it } from 'vitest';
import { DIAGNOSTIC_CODES } from '../../src/model/diagnostic-codes.js';
import { loadTopologyModel } from '../../src/load-topology-model.js';
import { createMemorySource } from '../../src/sources/memory-source.js';

const TOPOLOGY =
  'apiVersion: workspec.io/v1alpha1\nkind: Topology\nmetadata:\n  slug: web-app\nspec:\n  title: T\n  provider: azure\n  environments: [prod]\n  defaultEnvironment: prod\n  connections:\n    - from: a\n      to: b\n';
const RESOURCE = (name: string): string =>
  `apiVersion: workspec.io/v1alpha1\nkind: Resource\nmetadata: {}\nspec:\n  name: ${name}\n  kind: compute\n  type: T\n  provider: azure\n`;
const ENVIRONMENT =
  'apiVersion: workspec.io/v1alpha1\nkind: Environment\nmetadata: {}\nspec: {}\n';

function baseTree(): Record<string, string> {
  return {
    '.workspec/topologies/web-app.yaml': TOPOLOGY,
    '.workspec/resources/a.yaml': RESOURCE('A'),
    '.workspec/resources/b.yaml': RESOURCE('B'),
    '.workspec/environments/prod.yaml': ENVIRONMENT,
  };
}

describe('orphan-layout-file', () => {
  it('flags a .layout/ file whose slug names no topology', async () => {
    const model = await loadTopologyModel(
      createMemorySource({
        ...baseTree(),
        '.workspec/topologies/.layout/some-other-slug.yaml': 'version: 1\nnodes: {}\n',
      }),
    );

    expect(model.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'warning',
        code: DIAGNOSTIC_CODES.orphanLayoutFile,
        file: '.workspec/topologies/.layout/some-other-slug.yaml',
      }),
    );
    expect(model.layout).toBeNull();
  });
});

describe('orphan-layout-node / orphan-layout-edge-hint', () => {
  it('flags a pinned resource slug and an edge hint that match nothing the topology authors, and joins the layout otherwise', async () => {
    const model = await loadTopologyModel(
      createMemorySource({
        ...baseTree(),
        '.workspec/topologies/.layout/web-app.yaml':
          'version: 1\nnodes:\n  a:\n    positions:\n      network:\n        x: 1\n        y: 2\n  ghost-resource:\n    positions: {}\nedges:\n  a->b:\n    waypoints: []\n  a->ghost:\n    waypoints: []\n',
      }),
    );

    expect(model.layout?.path).toBe('.workspec/topologies/.layout/web-app.yaml');
    expect(model.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'warning',
        code: DIAGNOSTIC_CODES.orphanLayoutNode,
        message: expect.stringContaining('ghost-resource'),
      }),
    );
    expect(model.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'warning',
        code: DIAGNOSTIC_CODES.orphanLayoutEdgeHint,
        message: expect.stringContaining('a->ghost'),
      }),
    );
    // The valid `a` entry and `a->b` hint must NOT be flagged.
    const orphanMessages = model.diagnostics
      .filter((d) => d.code === DIAGNOSTIC_CODES.orphanLayoutNode || d.code === DIAGNOSTIC_CODES.orphanLayoutEdgeHint)
      .map((d) => d.message);
    expect(orphanMessages.some((m) => m.includes('"a"'))).toBe(false);
    expect(orphanMessages.some((m) => m.includes('a->b'))).toBe(false);
  });
});
