import { describe, expect, test } from 'vitest';
import type { ResolvedDiagram, ResolvedDiagramNode } from '@workspec/c4-model';
import type { Diagram, Layout } from '@workspec/c4-schema';
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

  test('.layout pins are exact and authoritative', async () => {
    const layout: Layout = {
      nodes: { sys: { x: 1234, y: 567, width: C4_NODE_WIDTH, height: C4_NODE_HEIGHT } },
    } as unknown as Layout;
    const view = resolved().view;
    if (!view) throw new Error('view missing');
    const positions = await elkC4Layout(view, layout);
    expect(positions['sys']).toEqual({ x: 1234, y: 567 });
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
