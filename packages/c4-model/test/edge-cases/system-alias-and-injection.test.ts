import { describe, expect, it } from 'vitest';
import { DIAGNOSTIC_CODES } from '../../src/model/diagnostic-codes.js';
import { loadC4Model } from '../../src/load-c4-model.js';
import { createMemorySource } from '../../src/sources/memory-source.js';

describe('no-system', () => {
  it('flags __system__ used in an edge when the tree has no system element', async () => {
    const model = await loadC4Model(
      createMemorySource({
        '.workspec/actors/architect.yaml': 'title: Architect\ndescription: Designs things.\n',
        '.workspec/diagrams/ctx.yaml':
          'title: Context\ntype: c4-context\nnodes:\n  - slug: architect\nedges:\n  - from: architect\n    to: __system__\n',
      }),
    );

    expect(model.diagnostics).toMatchObject([
      { severity: 'error', code: DIAGNOSTIC_CODES.noSystem, file: '.workspec/diagrams/ctx.yaml' },
    ]);
    // No redundant dangling-edge-ref for the same root cause.
    expect(model.diagnostics.filter((d) => d.code === DIAGNOSTIC_CODES.danglingEdgeRef)).toEqual(
      [],
    );
    expect(model.diagrams[0]?.view?.edges[0]).toMatchObject({ dangling: true });
  });

  it('does not fire when __system__ is never used, even with no system element', async () => {
    const model = await loadC4Model(
      createMemorySource({
        '.workspec/actors/architect.yaml': 'title: Architect\ndescription: Designs things.\n',
        '.workspec/diagrams/ctx.yaml':
          'title: Context\ntype: c4-context\nnodes:\n  - slug: architect\nedges: []\n',
      }),
    );

    expect(model.diagnostics).toEqual([]);
  });
});

describe('c4-context system-injection safety net', () => {
  it('injects the system as the first node when unreferenced', async () => {
    const model = await loadC4Model(
      createMemorySource({
        '.workspec/system/acme.yaml': 'title: Acme\ndescription: The system.\n',
        '.workspec/actors/architect.yaml': 'title: Architect\ndescription: Designs things.\n',
        '.workspec/diagrams/ctx.yaml':
          'title: Context\ntype: c4-context\nnodes:\n  - slug: architect\nedges: []\n',
      }),
    );

    expect(model.diagnostics).toEqual([]);
    const nodes = model.diagrams[0]?.view?.nodes ?? [];
    expect(nodes[0]).toMatchObject({
      nodeId: 'acme',
      slug: 'acme',
      kind: 'system',
      injected: true,
      title: 'Acme',
    });
    expect(nodes[1]).toMatchObject({ slug: 'architect', injected: false });
  });

  it('does not inject when the system is already referenced', async () => {
    const model = await loadC4Model(
      createMemorySource({
        '.workspec/system/acme.yaml': 'title: Acme\ndescription: The system.\n',
        '.workspec/diagrams/ctx.yaml':
          'title: Context\ntype: c4-context\nnodes:\n  - system: acme\nedges: []\n',
      }),
    );

    const nodes = model.diagrams[0]?.view?.nodes ?? [];
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({ slug: 'acme', injected: false });
  });

  it('does not inject (and is not an error) when the tree simply has no system at all', async () => {
    const model = await loadC4Model(
      createMemorySource({
        '.workspec/actors/architect.yaml': 'title: Architect\ndescription: Designs things.\n',
        '.workspec/diagrams/ctx.yaml':
          'title: Context\ntype: c4-context\nnodes:\n  - slug: architect\nedges: []\n',
      }),
    );

    expect(model.diagnostics).toEqual([]);
    expect(model.diagrams[0]?.view?.nodes).toHaveLength(1);
  });
});

describe('unknown-category', () => {
  it('warns on a category absent from both spec.yaml and the built-in defaults', async () => {
    const model = await loadC4Model(
      createMemorySource({
        '.workspec/actors/a.yaml': 'title: A\ndescription: a.\n',
        '.workspec/actors/b.yaml': 'title: B\ndescription: b.\n',
        '.workspec/diagrams/ctx.yaml':
          'title: Context\ntype: c4-context\nnodes:\n  - slug: a\n  - slug: b\nedges:\n  - from: a\n    to: b\n    category: mystery\n',
      }),
    );

    expect(model.diagnostics).toMatchObject([
      { severity: 'warning', code: DIAGNOSTIC_CODES.unknownCategory },
    ]);
  });

  it('does not warn for a built-in default category or a spec-defined one', async () => {
    const model = await loadC4Model(
      createMemorySource({
        '.workspec/spec.yaml':
          'type: style\nversion: 2\nconnections:\n  custom-thing:\n    accent: "#fff"\n',
        '.workspec/actors/a.yaml': 'title: A\ndescription: a.\n',
        '.workspec/actors/b.yaml': 'title: B\ndescription: b.\n',
        '.workspec/diagrams/ctx.yaml':
          'title: Context\ntype: c4-context\nnodes:\n  - slug: a\n  - slug: b\nedges:\n  - from: a\n    to: b\n    category: custom-thing\n  - from: b\n    to: a\n    category: governance\n',
      }),
    );

    expect(model.diagnostics.filter((d) => d.code === DIAGNOSTIC_CODES.unknownCategory)).toEqual(
      [],
    );
  });
});
