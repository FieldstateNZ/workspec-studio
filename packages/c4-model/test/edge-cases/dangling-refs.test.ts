import { describe, expect, it } from 'vitest';
import { DIAGNOSTIC_CODES } from '../../src/model/diagnostic-codes.js';
import { loadC4Model } from '../../src/load-c4-model.js';
import { createMemorySource } from '../../src/sources/memory-source.js';

describe('dangling-ref', () => {
  it('flags a bare slug that matches no element in any kind', async () => {
    const model = await loadC4Model(
      createMemorySource({
        '.workspec/diagrams/ctx.yaml':
          'title: Context\ntype: c4-context\nnodes:\n  - slug: ghost\nedges: []\n',
      }),
    );

    expect(model.diagnostics).toMatchObject([
      {
        severity: 'error',
        code: DIAGNOSTIC_CODES.danglingRef,
        file: '.workspec/diagrams/ctx.yaml',
        slug: 'ctx',
        refSlug: 'ghost',
        // `- slug: ghost` is line 4 of the diagram YAML.
        line: 4,
      },
    ]);
    expect(model.diagrams[0]?.view?.nodes[0]).toMatchObject({ slug: null, dangling: true });
  });

  it('flags a typed ref to a kind/slug pair that does not exist (missing file mid-resolution)', async () => {
    const model = await loadC4Model(
      createMemorySource({
        '.workspec/domains/billing.yaml': 'title: Billing\ndescription: Billing domain.\n',
        '.workspec/diagrams/ctx.yaml':
          'title: Context\ntype: c4-container\nnodes:\n  - domain: billing\n  - container: nonexistent\nedges: []\n',
      }),
    );

    const danglers = model.diagnostics.filter((d) => d.code === DIAGNOSTIC_CODES.danglingRef);
    expect(danglers).toHaveLength(1);
    expect(danglers[0]?.message).toContain('container "nonexistent"');
    expect(danglers[0]?.refSlug).toBe('nonexistent');
    // `- container: nonexistent` is line 5 of the diagram YAML.
    expect(danglers[0]?.line).toBe(5);
  });

  it('typed ref to an unsupported C4_REF_KINDS kind (class/interface/function) is always dangling', async () => {
    const model = await loadC4Model(
      createMemorySource({
        '.workspec/diagrams/code.yaml':
          'title: Code\ntype: c4-code\nnodes:\n  - class: Widget\nedges: []\n',
      }),
    );

    expect(model.diagnostics).toMatchObject([{ code: DIAGNOSTIC_CODES.danglingRef }]);
  });
});

describe('dangling-edge-ref', () => {
  it('flags an edge endpoint that does not match any node of the diagram', async () => {
    const model = await loadC4Model(
      createMemorySource({
        '.workspec/actors/architect.yaml': 'title: Architect\ndescription: Designs things.\n',
        '.workspec/diagrams/ctx.yaml':
          'title: Context\ntype: c4-context\nnodes:\n  - slug: architect\nedges:\n  - from: architect\n    to: nobody\n',
      }),
    );

    const edgeDiag = model.diagnostics.find((d) => d.code === DIAGNOSTIC_CODES.danglingEdgeRef);
    // `- from: architect` (the edge entry) is line 6 of the diagram YAML.
    expect(edgeDiag).toMatchObject({
      severity: 'error',
      file: '.workspec/diagrams/ctx.yaml',
      line: 6,
    });
    expect(model.diagrams[0]?.view?.edges[0]).toMatchObject({ dangling: true });
  });
});
