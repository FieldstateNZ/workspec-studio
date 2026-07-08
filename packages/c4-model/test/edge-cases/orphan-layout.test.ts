import { describe, expect, it } from 'vitest';
import { DIAGNOSTIC_CODES } from '../../src/model/diagnostic-codes.js';
import { loadC4Model } from '../../src/load-c4-model.js';
import { createMemorySource } from '../../src/sources/memory-source.js';

describe('orphan-layout-file', () => {
  it('flags a .layout/ file whose slug names no diagram', async () => {
    const model = await loadC4Model(
      createMemorySource({
        '.workspec/diagrams/.layout/nonexistent.yaml': 'version: 1\nnodes: {}\n',
      }),
    );

    expect(model.diagnostics).toMatchObject([
      { severity: 'warning', code: DIAGNOSTIC_CODES.orphanLayoutFile, file: '.workspec/diagrams/.layout/nonexistent.yaml' },
    ]);
  });
});

describe('orphan-layout-node and orphan-layout-edge-hint', () => {
  it('flags a pinned node slug and an edge hint key that match nothing the diagram authored', async () => {
    const model = await loadC4Model(
      createMemorySource({
        '.workspec/actors/architect.yaml': 'title: Architect\ndescription: Designs things.\n',
        '.workspec/diagrams/ctx.yaml': 'title: Context\ntype: c4-context\nnodes:\n  - slug: architect\nedges: []\n',
        '.workspec/diagrams/.layout/ctx.yaml':
          'version: 1\nnodes:\n  architect:\n    x: 0\n    y: 0\n  renamed-away:\n    x: 10\n    y: 10\nedges:\n  "a->b":\n    waypoints: []\n',
      }),
    );

    const orphanNode = model.diagnostics.find((d) => d.code === DIAGNOSTIC_CODES.orphanLayoutNode);
    expect(orphanNode).toMatchObject({ severity: 'warning', file: '.workspec/diagrams/.layout/ctx.yaml' });
    expect(orphanNode?.message).toContain('renamed-away');
    // The orphan pinned entry's value starts on line 7 (`x: 10`) of the layout YAML.
    expect(orphanNode?.line).toBe(7);

    const orphanEdge = model.diagnostics.find((d) => d.code === DIAGNOSTIC_CODES.orphanLayoutEdgeHint);
    expect(orphanEdge).toMatchObject({ severity: 'warning', file: '.workspec/diagrams/.layout/ctx.yaml' });
    expect(orphanEdge?.message).toContain('a->b');
    expect(orphanEdge?.line).toBeTypeOf('number');

    // "architect" is pinned and real — must not itself be flagged.
    expect(model.diagnostics.filter((d) => d.code === DIAGNOSTIC_CODES.orphanLayoutNode)).toHaveLength(1);
  });

  it('does not flag a layout pinning __system__ by alias when only edges (not nodes) reference the system', async () => {
    const model = await loadC4Model(
      createMemorySource({
        '.workspec/system/main.yaml': 'title: Main\ndescription: The system.\n',
        '.workspec/actors/architect.yaml': 'title: Architect\ndescription: Designs things.\n',
        '.workspec/diagrams/ctx.yaml':
          'title: Context\ntype: c4-context\nnodes:\n  - slug: architect\nedges:\n  - from: architect\n    to: __system__\n',
        '.workspec/diagrams/.layout/ctx.yaml':
          'version: 1\nnodes:\n  architect:\n    x: 0\n    y: 0\n  __system__:\n    x: 100\n    y: 0\n',
      }),
    );

    expect(model.diagnostics.filter((d) => d.code === DIAGNOSTIC_CODES.orphanLayoutNode)).toEqual([]);
  });
});
