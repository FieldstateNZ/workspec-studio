import { describe, expect, it } from 'vitest';
import { DIAGNOSTIC_CODES } from '../../src/model/diagnostic-codes.js';
import { loadC4Model } from '../../src/load-c4-model.js';
import { createMemorySource } from '../../src/sources/memory-source.js';

/**
 * B1 regression suite: a diagram of ANY type whose EDGES reference
 * `__system__` (with no node entry for it) must get the system node
 * materialized into the view, so every resolved edge endpoint names a node
 * actually present in `view.nodes` — never a phantom id.
 */
describe('edge-only __system__ refs materialize the system node (any diagram type)', () => {
  const systemFile = { '.workspec/system/acme.yaml': 'title: Acme\ndescription: The system.\n' };
  const domainFile = {
    '.workspec/domains/billing.yaml': 'title: Billing\ndescription: Billing domain.\n',
  };

  it('c4-container: both lens views gain the injected system node and consistent edge endpoints', async () => {
    const model = await loadC4Model(
      createMemorySource({
        ...systemFile,
        ...domainFile,
        '.workspec/diagrams/cont.yaml':
          'title: Container\ntype: c4-container\nnodes:\n  - domain: billing\nedges:\n  - from: billing\n    to: __system__\n',
      }),
    );

    expect(model.diagnostics).toEqual([]);
    const { lensViews } = model.diagrams[0] ?? {};
    for (const view of [lensViews?.logical, lensViews?.deployment]) {
      const system = view?.nodes.find((n) => n.kind === 'system');
      expect(system).toMatchObject({
        nodeId: 'acme',
        slug: 'acme',
        injected: true,
        dangling: false,
      });
      const edge = view?.edges[0];
      expect(edge).toMatchObject({ from: 'billing', to: 'acme', dangling: false });
      // Contract: every non-dangling endpoint names a node present in the view.
      expect(view?.nodes.some((n) => n.nodeId === edge?.to)).toBe(true);
    }
  });

  it('custom diagram type: the system node is injected and the edge resolves', async () => {
    const model = await loadC4Model(
      createMemorySource({
        ...systemFile,
        ...domainFile,
        '.workspec/diagrams/flow.yaml':
          'title: Flow\ntype: custom\nnodes:\n  - slug: billing\nedges:\n  - from: billing\n    to: __system__\n',
      }),
    );

    expect(model.diagnostics).toEqual([]);
    const view = model.diagrams[0]?.view;
    expect(view?.nodes.find((n) => n.kind === 'system')).toMatchObject({
      nodeId: 'acme',
      injected: true,
    });
    expect(view?.edges[0]).toMatchObject({ from: 'billing', to: 'acme', dangling: false });
  });

  it('non-c4-context diagram with NO __system__ usage gets no injection', async () => {
    const model = await loadC4Model(
      createMemorySource({
        ...systemFile,
        ...domainFile,
        '.workspec/diagrams/cont.yaml':
          'title: Container\ntype: c4-container\nnodes:\n  - domain: billing\nedges: []\n',
      }),
    );

    for (const view of Object.values(model.diagrams[0]?.lensViews ?? {})) {
      expect(view.nodes.some((n) => n.kind === 'system')).toBe(false);
    }
  });

  it('without a system in the tree: no-system error, dangling edge, no phantom node', async () => {
    const model = await loadC4Model(
      createMemorySource({
        ...domainFile,
        '.workspec/diagrams/cont.yaml':
          'title: Container\ntype: c4-container\nnodes:\n  - domain: billing\nedges:\n  - from: billing\n    to: __system__\n',
      }),
    );

    expect(model.diagnostics).toMatchObject([
      { severity: 'error', code: DIAGNOSTIC_CODES.noSystem },
    ]);
    const { lensViews } = model.diagrams[0] ?? {};
    for (const view of [lensViews?.logical, lensViews?.deployment]) {
      expect(view?.nodes.some((n) => n.kind === 'system')).toBe(false);
      expect(view?.edges[0]).toMatchObject({ dangling: true });
    }
  });

  it('a lens-restricted __system__ edge injects only into its own lens view', async () => {
    const model = await loadC4Model(
      createMemorySource({
        ...systemFile,
        ...domainFile,
        '.workspec/diagrams/cont.yaml':
          'title: Container\ntype: c4-container\nnodes:\n  - domain: billing\nedges:\n  - from: billing\n    to: __system__\n    lens: logical\n',
      }),
    );

    expect(model.diagnostics).toEqual([]);
    const { lensViews } = model.diagrams[0] ?? {};
    expect(lensViews?.logical.nodes.some((n) => n.kind === 'system')).toBe(true);
    expect(lensViews?.deployment.nodes.some((n) => n.kind === 'system')).toBe(false);
  });
});
