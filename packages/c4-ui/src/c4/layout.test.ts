import { describe, expect, test } from 'vitest';
import type { ResolvedDiagram, ResolvedDiagramNode } from '@workspec/c4-model';
import type { Diagram, Layout } from '@workspec/c4-schema';
import { layoutDiagram } from '@workspec/c4-layout';
import { elkC4Layout, projectC4Diagram } from './layout.js';
import { nodeShapeId } from './project-model.js';
import { C4_NODE_HEIGHT, C4_NODE_WIDTH } from './shapes/c4-node-shape-util.js';

// Decision-A composition (#119): elk (@workspec/c4-layout) is the position
// authority — pins exact, auto nodes deterministic — while edge LOOK comes
// from the S2 orthogonal router at render time (PositionedEdge.route is
// never read; `.layout` edge waypoints are advisory).

function node(nodeId: string, kind: string): ResolvedDiagramNode {
  return {
    nodeId,
    slug: nodeId,
    kind,
    title: nodeId,
    description: null,
    technology: null,
    tags: [],
    position: null,
    injected: false,
    dangling: false,
  };
}

function resolved(layout: Layout | null = null): ResolvedDiagram {
  return {
    slug: 'ctx',
    path: 'diagrams/ctx.yaml',
    title: 'Context',
    type: 'c4-context',
    description: null,
    raw: {} as Diagram,
    view: {
      nodes: [node('user', 'actor'), node('sys', 'system'), node('billing', 'external-system')],
      edges: [
        { from: 'user', to: 'sys', label: 'uses', category: null, lens: null, dangling: false },
        { from: 'sys', to: 'billing', label: null, category: null, lens: null, dangling: false },
      ],
    },
    lensViews: null,
    layout: layout ? { path: '.layout/ctx.yaml', data: layout } : null,
  };
}

describe('elkC4Layout', () => {
  test('auto-lays a fresh diagram deterministically (no overlaps, LR flow)', async () => {
    const view = resolved().view;
    if (!view) throw new Error('view missing');
    const a = await elkC4Layout(view, null);
    const b = await elkC4Layout(view, null);
    expect(a).toEqual(b); // determinism
    expect(Object.keys(a).sort()).toEqual(['billing', 'sys', 'user']);
    // LR flow: user → sys → billing strictly increases in x.
    const ux = a['user']?.x ?? 0;
    const sx = a['sys']?.x ?? 0;
    const bx = a['billing']?.x ?? 0;
    expect(ux).toBeLessThan(sx);
    expect(sx).toBeLessThan(bx);
  });

  test('.layout pins are exact and authoritative — and the resolved size rides along', async () => {
    const layout: Layout = {
      nodes: { sys: { x: 1234, y: 567, width: C4_NODE_WIDTH, height: C4_NODE_HEIGHT } },
    } as unknown as Layout;
    const view = resolved().view;
    if (!view) throw new Error('view missing');
    const positions = await elkC4Layout(view, layout);
    expect(positions['sys']).toEqual({
      x: 1234,
      y: 567,
      width: C4_NODE_WIDTH,
      height: C4_NODE_HEIGHT,
    });
  });

  test('a pinned per-node size survives into the placement (S4 fix round)', async () => {
    const layout: Layout = {
      nodes: { sys: { x: 1234, y: 567, width: 240, height: 120 } },
    } as unknown as Layout;
    const view = resolved().view;
    if (!view) throw new Error('view missing');
    const positions = await elkC4Layout(view, layout);
    expect(positions['sys']).toEqual({ x: 1234, y: 567, width: 240, height: 120 });
  });
});

describe('inter-layer spacing is c4-layout’s pinned default (#120 revert, #134)', () => {
  // The S4 round widened the inter-layer gap to enterprise's `ranksep`
  // scalar so the midpoint pills would "fit by construction". They don't
  // (the pill is screen-space, the gap is page-space), and the widening
  // cost 72% bbox width on the dogfood container diagram. `elkC4Layout`
  // must therefore pass NO `layerSpacing` and inherit the package default.
  //
  // Mutation guard: re-adding any `layerSpacing:` override to elkC4Layout
  // widens the composed column pitch past the bare-`layoutDiagram`
  // baseline and fails the equality below.
  const wideLabel = 'consumes as a workspace devDependency (pre-publish)';
  const view: NonNullable<ResolvedDiagram['view']> = {
    nodes: [node('left', 'actor'), node('right', 'system')],
    edges: [{ from: 'left', to: 'right', label: wideLabel, category: null, lens: null, dangling: false }],
  };

  test('composed layout matches bare layoutDiagram — long labels do not widen the gap', async () => {
    const composed = await elkC4Layout(view, null);
    const baseline = await layoutDiagram({ nodes: view.nodes, edges: view.edges, layout: null });

    const baselineById = Object.fromEntries(baseline.nodes.map((n) => [n.nodeId, n]));
    for (const [nodeId, placement] of Object.entries(composed)) {
      const expected = baselineById[nodeId];
      if (!expected) throw new Error(`${nodeId} missing from the baseline layout`);
      expect(placement).toEqual({
        x: expected.x,
        y: expected.y,
        width: expected.width,
        height: expected.height,
      });
    }
  });

  test('label length does not move any node — spacing is label-blind again', async () => {
    const short: NonNullable<ResolvedDiagram['view']> = {
      nodes: view.nodes,
      edges: [{ from: 'left', to: 'right', label: 'x', category: null, lens: null, dangling: false }],
    };
    expect(await elkC4Layout(view, null)).toEqual(await elkC4Layout(short, null));
  });
});

describe('projectC4Diagram', () => {
  test('one call: layout + projection compose (elk default)', async () => {
    const result = await projectC4Diagram(resolved());
    expect(result.shapes[nodeShapeId('user')]).toBeDefined();
    expect(result.shapes[nodeShapeId('sys')]).toBeDefined();
    expect(result.bounds).not.toBeNull();
  });

  test('the layout seam is injectable', async () => {
    const result = await projectC4Diagram(resolved(), {
      layoutFn: (view) =>
        Promise.resolve(
          Object.fromEntries(view.nodes.map((n, i) => [n.nodeId, { x: i * 400, y: 0 }])),
        ),
    });
    expect(result.shapes[nodeShapeId('user')]).toMatchObject({ x: 0, y: 0 });
    expect(result.shapes[nodeShapeId('billing')]).toMatchObject({ x: 800, y: 0 });
  });
});
