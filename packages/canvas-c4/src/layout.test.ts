import { describe, expect, test } from 'vitest';
import type { ResolvedDiagram, ResolvedDiagramNode } from '@workspec/c4-model';
import type { Diagram, Layout } from '@workspec/c4-schema';
import { resolveConnectorGeometry } from '@workspec/canvas';
import type { ConnectorShape } from '@workspec/canvas';
import { elkC4Layout, labelAwareLayerSpacing, projectC4Diagram } from './layout.js';
import { buildC4Shapes, edgeShapeId, nodeShapeId } from './project-model.js';
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

describe('labelAwareLayerSpacing (S4 fix round, #120)', () => {
  test('mirrors the enterprise ranksep formula: max(120, maxLabelWidth + 60)', () => {
    // No labels → the enterprise LR floor.
    expect(labelAwareLayerSpacing([])).toBe(120);
    expect(labelAwareLayerSpacing([{ label: null }])).toBe(120);
    // One long label: ceil(len * 6.5 + 30) + 60.
    const label = 'authors .workspec/ specs and layout pins';
    const estimated = Math.ceil(label.length * 6.5 + 30);
    expect(labelAwareLayerSpacing([{ label }, { label: 'short' }])).toBe(
      Math.max(120, estimated + 60),
    );
  });

  test('a long label on a short edge gets a gap the pill fits into — its bbox clears both node rects', async () => {
    // The exact defect class the parity review caught: a ~300px midpoint
    // pill in c4-layout's fixed 80px inter-layer gap clips under both
    // cards. The composed pipeline must pass label-aware spacing through.
    const label = 'authors .workspec/ specs, diagrams and layout pins';
    const view: NonNullable<ResolvedDiagram['view']> = {
      nodes: [node('left', 'actor'), node('right', 'system')],
      edges: [{ from: 'left', to: 'right', label, category: null, lens: null, dangling: false }],
    };
    const placements = await elkC4Layout(view, null);
    const projection = buildC4Shapes(
      {
        slug: 'gap',
        path: 'diagrams/gap.yaml',
        title: 'Gap',
        type: 'c4-context',
        description: null,
        raw: {} as Diagram,
        view,
        lensViews: null,
        layout: null,
      },
      { positions: placements },
    );
    const connector = projection.shapes[edgeShapeId('left', 'right')] as ConnectorShape;
    const geom = resolveConnectorGeometry(connector, projection.shapes);
    if (!geom) throw new Error('edge geometry missing');

    // The pill renders centred on the route midpoint: estimate its bbox the
    // way the layout estimates it (the enterprise formula) plus the chip's
    // vertical extent, and require clearance from every node card rect.
    const pillW = Math.ceil(label.length * 6.5 + 30);
    const pillH = 24;
    const pill = {
      minX: geom.label.x - pillW / 2,
      maxX: geom.label.x + pillW / 2,
      minY: geom.label.y - pillH / 2,
      maxY: geom.label.y + pillH / 2,
    };
    for (const id of [nodeShapeId('left'), nodeShapeId('right')]) {
      const shape = projection.shapes[id];
      if (!shape) throw new Error(`${id} missing`);
      const intersects =
        pill.minX < shape.x + shape.width &&
        pill.maxX > shape.x &&
        pill.minY < shape.y + shape.height &&
        pill.maxY > shape.y;
      expect(intersects).toBe(false);
    }
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
