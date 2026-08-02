import { describe, expect, test } from 'vitest';
import type { ResolvedDiagram, ResolvedDiagramNode } from '@workspec/c4-model';
import type { Diagram } from '@workspec/c4-schema';
import type { Shape, ShapeId } from '@workspec/canvas';
import {
  buildC4Shapes,
  edgeShapeId,
  fitCamera,
  nodeShapeId,
  viewFor,
} from './project-model.js';
import { C4_NODE_HEIGHT, C4_NODE_WIDTH } from './shapes/c4-node-shape-util.js';
import { C4_BOUNDARY_PAD } from './shapes/c4-boundary-shape-util.js';

function node(
  nodeId: string,
  kind: string | null,
  title = nodeId,
  overrides: Partial<ResolvedDiagramNode> = {},
): ResolvedDiagramNode {
  return {
    nodeId,
    slug: kind === null ? null : nodeId,
    kind,
    title,
    description: null,
    technology: null,
    tags: [],
    position: null,
    injected: false,
    dangling: false,
    ...overrides,
  };
}

function edge(
  from: string,
  to: string,
  overrides: {
    label?: string | null;
    category?: string | null;
    lens?: 'logical' | 'deployment' | 'both' | null;
    dangling?: boolean;
  } = {},
) {
  return {
    from,
    to,
    label: overrides.label ?? null,
    category: overrides.category ?? null,
    lens: overrides.lens ?? null,
    dangling: overrides.dangling ?? false,
  };
}

function diagram(
  type: string,
  nodes: ResolvedDiagramNode[],
  edges: ReturnType<typeof edge>[],
): ResolvedDiagram {
  return {
    slug: 'test',
    path: 'diagrams/test.yaml',
    title: 'Test',
    type,
    description: null,
    raw: {} as Diagram,
    view: { nodes, edges },
    lensViews: null,
    layout: null,
  };
}

const POSITIONS = {
  user: { x: 0, y: 0 },
  app: { x: 500, y: 0 },
  db: { x: 1000, y: 0 },
  ext: { x: 1500, y: 0 },
};

describe('buildC4Shapes — representative tree', () => {
  const resolved = diagram(
    'c4-context',
    [
      node('user', 'actor', 'User'),
      node('app', 'system', 'The System', { description: 'Core platform' }),
      node('ext', 'external-system', 'Billing'),
    ],
    [edge('user', 'app', { label: 'uses', category: 'interaction' }), edge('app', 'ext')],
  );

  test('projects nodes with deterministic ids, fixed geometry, and the meta protocol', () => {
    const result = buildC4Shapes(resolved, { positions: POSITIONS });
    const app = result.shapes[nodeShapeId('app')];
    expect(app).toMatchObject({
      type: 'c4node',
      x: 500,
      y: 0,
      width: C4_NODE_WIDTH,
      height: C4_NODE_HEIGHT,
      slug: 'app',
      nodeType: 'system',
      label: 'The System',
      description: 'Core platform',
      drillable: false,
      drafted: false,
      reworking: false,
    });
    expect(app?.meta).toMatchObject({ ephemeral: true, slug: 'app' });
    expect(result.slugToShapeId['app']).toBe(nodeShapeId('app'));
    // The '__system__' DSL alias resolves to the system-kind node.
    expect(result.slugToShapeId['__system__']).toBe(nodeShapeId('app'));
  });

  test('projects connectors with dual identity, lane/fan defaults and ephemeral meta', () => {
    const result = buildC4Shapes(resolved, { positions: POSITIONS });
    const e = result.shapes[edgeShapeId('user', 'app')];
    expect(e).toMatchObject({
      type: 'connector',
      sourceShapeId: nodeShapeId('user'),
      targetShapeId: nodeShapeId('app'),
      edgeFrom: 'user',
      edgeTo: 'app',
      label: 'uses',
      category: 'interaction',
      laneOffset: 0,
      fanRole: 'balanced',
    });
    expect(e?.meta).toEqual({ ephemeral: true });
  });

  test('bounds cover the node bbox; fitCamera frames them capped at 1×', () => {
    const result = buildC4Shapes(resolved, { positions: POSITIONS });
    expect(result.bounds).toEqual({
      x: 0,
      y: 0,
      width: 1500 + C4_NODE_WIDTH,
      height: C4_NODE_HEIGHT,
    });
    const cam = fitCamera(result.bounds, 900, 600);
    expect(cam.zoom).toBeLessThanOrEqual(1);
    expect(cam.zoom).toBeGreaterThanOrEqual(0.1);
  });

  test('fitCamera: the 1× zoom cap BINDS for small content (#119 FIX 3)', () => {
    // 100×50 content in a 900×600 viewport: uncapped zoom would be
    // min(700/100, 400/50) = 7 — the cap must clamp it to exactly 1 and
    // centre at 1×.
    const cam = fitCamera({ x: 0, y: 0, width: 100, height: 50 }, 900, 600);
    expect(cam.zoom).toBe(1);
    expect(cam.x).toBeCloseTo(50 - 450);
    expect(cam.y).toBeCloseTo(25 - 300);
  });

  test('card geometry is pinned to the shared 300×110 (imported from @workspec/c4-layout)', () => {
    // The constants are imported from the position authority, so renderer/
    // layout drift is impossible by construction; the LITERALS below pin
    // the shared value itself (a c4-layout-side drift fails here).
    expect(C4_NODE_WIDTH).toBe(300);
    expect(C4_NODE_HEIGHT).toBe(110);
  });

  test('host flags land on the shapes: drillable / drafted / reworking / scope', () => {
    const result = buildC4Shapes(resolved, {
      positions: POSITIONS,
      drillableSlugs: new Set(['app']),
      draftedSlugs: new Set(['ext']),
      reworkingMap: new Map([['user', { reworking: true, canvasObjectId: 'co-1' }]]),
      scopeSlug: 'app',
    });
    expect(result.shapes[nodeShapeId('app')]).toMatchObject({ drillable: true, isScope: true });
    expect(result.shapes[nodeShapeId('ext')]).toMatchObject({ drafted: true });
    expect(result.shapes[nodeShapeId('user')]).toMatchObject({
      reworking: true,
      canvasObjectId: 'co-1',
    });
  });

  test('studio-only node fields carry through meta; dangling edges are dropped', () => {
    const withExtras = diagram(
      'c4-context',
      [
        node('user', 'actor', 'User', {
          technology: 'human',
          tags: ['persona'],
          injected: true,
          slug: 'the-user-element',
        }),
        node('ghost', null, 'Unresolved', { dangling: true }),
      ],
      [edge('user', 'nowhere', { dangling: true })],
    );
    const result = buildC4Shapes(withExtras, { positions: { user: { x: 0, y: 0 } } });
    expect(result.shapes[nodeShapeId('user')]?.meta).toMatchObject({
      technology: 'human',
      tags: ['persona'],
      injected: true,
      // The resolved ELEMENT slug rides along when distinct from nodeId.
      elementSlug: 'the-user-element',
    });
    // Unresolved node: kind null → 'unknown' styling hook + meta.dangling.
    expect(result.shapes[nodeShapeId('ghost')]).toMatchObject({ nodeType: 'unknown' });
    expect(result.shapes[nodeShapeId('ghost')]?.meta).toMatchObject({ dangling: true });
    // The dangling edge never projected.
    expect(result.shapes[edgeShapeId('user', 'nowhere')]).toBeUndefined();
  });

  test('inline authored positions are the fallback when the caller supplies none', () => {
    const pinned = diagram(
      'c4-context',
      [node('user', 'actor', 'User', { position: { x: 42, y: 24 } })],
      [],
    );
    const result = buildC4Shapes(pinned);
    expect(result.shapes[nodeShapeId('user')]).toMatchObject({ x: 42, y: 24 });
  });
});

describe('buildC4Shapes — container lens partition', () => {
  const container = diagram(
    'c4-container',
    [
      node('user', 'actor', 'User'),
      node('sys', 'system', 'System'),
      node('sales', 'domain', 'Sales'),
      node('web', 'container', 'Web'),
      node('db', 'database', 'DB'),
    ],
    [
      edge('user', 'web', { lens: 'deployment' }),
      edge('user', 'sales', { lens: 'logical' }),
      edge('web', 'db', { lens: 'both' }),
    ],
  );
  const positions = {
    user: { x: 0, y: 0 },
    sys: { x: 400, y: 0 },
    sales: { x: 800, y: 0 },
    web: { x: 800, y: 300 },
    db: { x: 1200, y: 300 },
  };
  const boundary = { level: 'container' as const, label: 'System', accent: 'var(--el-system)' };

  test('logical lens: domains inside, infra filtered out, logical+both edges only', () => {
    const result = buildC4Shapes(container, { lens: 'logical', positions, boundary });
    expect(result.shapes[nodeShapeId('sales')]).toBeDefined();
    expect(result.shapes[nodeShapeId('web')]).toBeUndefined();
    expect(result.shapes[nodeShapeId('db')]).toBeUndefined();
    expect(result.shapes[edgeShapeId('user', 'sales')]).toBeDefined();
    expect(result.shapes[edgeShapeId('user', 'web')]).toBeUndefined();
    // Contained node tagged for live boundary reflow.
    expect(result.shapes[nodeShapeId('sales')]?.meta).toMatchObject({ inBoundary: true });
  });

  test('deployment lens: infra inside, domains filtered out', () => {
    const result = buildC4Shapes(container, { lens: 'deployment', positions, boundary });
    expect(result.shapes[nodeShapeId('web')]).toBeDefined();
    expect(result.shapes[nodeShapeId('db')]).toBeDefined();
    expect(result.shapes[nodeShapeId('sales')]).toBeUndefined();
    expect(result.shapes[edgeShapeId('user', 'web')]).toBeDefined();
    expect(result.shapes[edgeShapeId('web', 'db')]).toBeDefined();
  });

  test('lensViews (pre-partitioned) select by lens', () => {
    const lensed: ResolvedDiagram = {
      ...container,
      view: null,
      lensViews: {
        logical: { nodes: [node('sales', 'domain', 'Sales')], edges: [] },
        deployment: { nodes: [node('web', 'container', 'Web')], edges: [] },
      },
    };
    expect(viewFor(lensed, 'logical').nodes[0]?.nodeId).toBe('sales');
    expect(viewFor(lensed, 'deployment').nodes[0]?.nodeId).toBe('web');
    const result = buildC4Shapes(lensed, { lens: 'deployment', positions });
    expect(result.shapes[nodeShapeId('web')]).toBeDefined();
    expect(result.shapes[nodeShapeId('sales')]).toBeUndefined();
  });
});

describe('buildC4Shapes — boundary + z-banding', () => {
  const container = diagram(
    'c4-container',
    [
      node('user', 'actor', 'User'),
      node('sales', 'domain', 'Sales'),
      node('ops', 'domain', 'Ops'),
    ],
    [edge('user', 'sales')],
  );
  const positions = {
    user: { x: -600, y: 100 },
    sales: { x: 0, y: 0 },
    ops: { x: 400, y: 200 },
  };
  const boundary = { level: 'container' as const, label: 'ACME', accent: 'var(--el-system)' };

  test('the boundary hugs the inside bbox + pad, labelled and accented', () => {
    // Literal 48 pad (not the symbolic constant — a tautology the review
    // flagged, #119 FIX 7): x = 0 − 48, width = 400 + 300 + 96, etc.
    expect(C4_BOUNDARY_PAD).toBe(48);
    const result = buildC4Shapes(container, { lens: 'logical', positions, boundary });
    const b = result.shapes['c4_boundary' as ShapeId];
    expect(b).toMatchObject({
      type: 'c4boundary',
      label: 'ACME',
      accent: 'var(--el-system)',
      x: -48,
      y: -48,
      width: 400 + 300 + 96,
      height: 200 + 110 + 96,
    });
  });

  test('z-bands: outside nodes < boundary < connectors < inside nodes', () => {
    const result = buildC4Shapes(container, { lens: 'logical', positions, boundary });
    const idx = (id: ShapeId): string => (result.shapes[id] as Shape).index;
    const outside = idx(nodeShapeId('user'));
    const bIdx = idx('c4_boundary' as ShapeId);
    const conn = idx(edgeShapeId('user', 'sales'));
    const inside = idx(nodeShapeId('sales'));
    expect(outside < bIdx).toBe(true);
    expect(bIdx < conn).toBe(true);
    expect(conn < inside).toBe(true);
  });

  test('an empty interior gets the default footprint centred on the node centroid', () => {
    const empty = diagram('c4-container', [node('user', 'actor', 'User')], []);
    const result = buildC4Shapes(empty, {
      lens: 'logical',
      positions: { user: { x: 100, y: 100 } },
      boundary,
    });
    const b = result.shapes['c4_boundary' as ShapeId];
    expect(b).toMatchObject({ width: 600, height: 360 });
    // Centred on the (single-node) centroid.
    expect(b?.x).toBe(100 - 300);
    expect(b?.y).toBe(100 - 180);
  });

  test('meta.dimmed is NOT set by the projection (current enterprise parity)', () => {
    const result = buildC4Shapes(container, { lens: 'logical', positions, boundary });
    for (const s of Object.values(result.shapes)) {
      expect((s.meta as { dimmed?: boolean } | undefined)?.dimmed).toBeUndefined();
    }
  });
});

describe('buildC4Shapes — lane offsets and fan roles', () => {
  test('equal source-Y lanes tie-break deterministically by slug (#119 FIX 10)', () => {
    const resolved = diagram(
      'c4-context',
      [
        node('zeta', 'system', 'Z'),
        node('alpha', 'system', 'A'),
        node('hub', 'system', 'Hub'),
      ],
      [edge('zeta', 'hub'), edge('alpha', 'hub')],
    );
    // Both sources at the SAME y — order must fall back to slug: alpha < zeta.
    const result = buildC4Shapes(resolved, {
      positions: {
        zeta: { x: 0, y: 100 },
        alpha: { x: 0, y: 100 },
        hub: { x: 700, y: 100 },
      },
    });
    expect(result.shapes[edgeShapeId('alpha', 'hub')]).toMatchObject({ laneOffset: -7 });
    expect(result.shapes[edgeShapeId('zeta', 'hub')]).toMatchObject({ laneOffset: 7 });
  });

  test('co-terminal edges fan across the shared face, ordered by source Y', () => {
    const resolved = diagram(
      'c4-context',
      [
        node('a', 'system', 'A'),
        node('b', 'system', 'B'),
        node('c', 'system', 'C'),
        node('hub', 'system', 'Hub'),
      ],
      [edge('a', 'hub'), edge('b', 'hub'), edge('c', 'hub')],
    );
    const result = buildC4Shapes(resolved, {
      positions: {
        a: { x: 0, y: 0 },
        b: { x: 0, y: 300 },
        c: { x: 0, y: 600 },
        hub: { x: 700, y: 300 },
      },
    });
    // Three incoming lanes at 14px spacing, centred: -14, 0, +14 by source Y.
    expect(result.shapes[edgeShapeId('a', 'hub')]).toMatchObject({
      laneOffset: -14,
      fanRole: 'target-fan',
    });
    expect(result.shapes[edgeShapeId('b', 'hub')]).toMatchObject({ laneOffset: 0 });
    expect(result.shapes[edgeShapeId('c', 'hub')]).toMatchObject({ laneOffset: 14 });
  });
});
