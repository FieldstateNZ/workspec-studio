import { describe, expect, test } from 'vitest';
import {
  connectorAABB,
  connectorGeometry,
  isDiscoveryConnector,
  resolveConnectorGeometry,
  straightConnectorGeometry,
} from './geometry.js';
import type { ConnectorShape } from '../../shape-types.js';
import type { Shape, ShapeId, Vec2 } from '../../types.js';
import { shapeFactory } from '../../test-helpers/factories.js';

// The orthogonal router is the S2 parity crown jewel (#118): the committed
// snapshot below pins the EXACT routes so any port drift — side selection,
// clamping, stub lengths, detour lanes, cost function — fails loudly.

function record(shapes: Shape[]): Record<ShapeId, Shape> {
  const out: Record<ShapeId, Shape> = {};
  for (const s of shapes) out[s.id] = s;
  return out;
}

function connector(
  source: Shape | null,
  target: Shape | null,
  overrides: Partial<ConnectorShape> = {},
): ConnectorShape {
  const base = shapeFactory({ type: 'connector', x: 0, y: 0, width: 0, height: 0 });
  return {
    ...base,
    type: 'connector',
    sourceShapeId: source?.id ?? null,
    targetShapeId: target?.id ?? null,
    edgeFrom: source?.id ?? '',
    edgeTo: target?.id ?? '',
    ...overrides,
  } as ConnectorShape;
}

/** A C4 node rect (routed kind) at a fixed spot — the enterprise 300×110 card. */
function node(x: number, y: number, w = 300, h = 110): Shape {
  return shapeFactory({ type: 'c4node', x, y, width: w, height: h });
}

function isOrthogonal(points: Vec2[]): boolean {
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (a && b && a.x !== b.x && a.y !== b.y) return false;
  }
  return true;
}

describe('orthogonal router — committed route snapshot', () => {
  test('route table for the canonical arrangements', () => {
    // Deterministic fixture nodes (the factory's ids/indexes never enter
    // the geometry — only rects do).
    const routes: Record<string, unknown> = {};

    // 1. Horizontal neighbours (axis-aligned, Z-route through the midline).
    {
      const a = node(0, 0);
      const b = node(600, 0);
      const c = connector(a, b);
      routes['horizontal-z'] = connectorGeometry(c, record([a, b, c]));
    }

    // 2. Perpendicular (dominant-x with real dy → L-route onto the top face).
    {
      const a = node(0, 0);
      const b = node(600, 400);
      const c = connector(a, b);
      routes['perpendicular-l'] = connectorGeometry(c, record([a, b, c]));
    }

    // 3. Vertical neighbours (vertical Z-route).
    {
      const a = node(0, 0);
      const b = node(40, 500);
      const c = connector(a, b);
      routes['vertical-z'] = connectorGeometry(c, record([a, b, c]));
    }

    // 4. Obstacle between the endpoints → detour around it, stubs
    //    perpendicular to both faces.
    {
      const a = node(0, 0, 120, 80);
      const b = node(600, 0, 120, 80);
      const blocker = node(300, 10, 120, 60);
      const c = connector(a, b);
      routes['obstacle-detour'] = connectorGeometry(c, record([a, b, blocker, c]));
    }

    // 5. Fan roles redirect the faces for co-terminal bundles. The
    //    dx-dominant row pins the case where target-fan coincides with the
    //    default; the dy-DOMINANT rows pin the actual redirects (without
    //    the fan branches the default would exit bottom/enter top —
    //    deleting either branch in getEdgeParams flips these rows).
    {
      const a = node(0, 0);
      const b = node(600, 400);
      const cTarget = connector(a, b, { fanRole: 'target-fan' });
      const cSource = connector(a, b, { fanRole: 'source-fan' });
      routes['target-fan'] = connectorGeometry(cTarget, record([a, b, cTarget]));
      routes['source-fan'] = connectorGeometry(cSource, record([a, b, cSource]));

      const below = node(200, 500);
      const cTargetDy = connector(a, below, { fanRole: 'target-fan' });
      const cBalancedDy = connector(a, below, { fanRole: 'balanced' });
      routes['target-fan-dy-dominant'] = connectorGeometry(cTargetDy, record([a, below, cTargetDy]));
      routes['balanced-dy-dominant'] = connectorGeometry(cBalancedDy, record([a, below, cBalancedDy]));
    }

    // 6. Lane offset slides the anchors along the shared faces.
    {
      const a = node(0, 0);
      const b = node(600, 0);
      const c = connector(a, b, { laneOffset: 14 });
      routes['lane-offset'] = connectorGeometry(c, record([a, b, c]));
    }

    // 7. REVERSED directions (dx<0 / dy<0) — the side-selection ternaries'
    //    other arms. Target left of source, horizontally and diagonally,
    //    plus upward.
    {
      const a = node(600, 0);
      const b = node(0, 0);
      const c = connector(a, b);
      routes['reversed-horizontal'] = connectorGeometry(c, record([a, b, c]));
    }
    {
      const a = node(600, 400);
      const b = node(0, 0);
      const c = connector(a, b);
      routes['reversed-diagonal'] = connectorGeometry(c, record([a, b, c]));
    }
    {
      const a = node(0, 500);
      const b = node(40, 0);
      const c = connector(a, b);
      routes['reversed-vertical'] = connectorGeometry(c, record([a, b, c]));
    }

    // 8. Self-loop (source === target): degenerate but deterministic —
    //    both anchors project onto the same rect.
    {
      const a = node(0, 0);
      const c = connector(a, a);
      routes['self-loop'] = connectorGeometry(c, record([a, c]));
    }

    expect(routes).toMatchSnapshot();
  });

  test('every routed polyline is strictly orthogonal', () => {
    const a = node(0, 0);
    const b = node(600, 400);
    const blocker = node(280, 150, 200, 120);
    const c = connector(a, b);
    const geom = connectorGeometry(c, record([a, b, blocker, c]));
    expect(geom).not.toBeNull();
    if (geom) {
      expect(geom.points.length).toBeGreaterThanOrEqual(2);
      expect(isOrthogonal(geom.points)).toBe(true);
    }
  });

  test('a clear straight route is kept even when other nodes exist off-path', () => {
    const a = node(0, 0, 120, 80);
    const b = node(600, 0, 120, 80);
    const offPath = node(300, 500, 120, 80);
    const c = connector(a, b);
    const geom = connectorGeometry(c, record([a, b, offPath, c]));
    // Same as the unobstructed route: 4-point Z through the midline.
    const clear = connectorGeometry(c, record([a, b, c]));
    expect(geom).toEqual(clear);
  });

  test('dangling connector with a freeEnd routes to the point; without one returns null', () => {
    const a = node(0, 0);
    const dragging = connector(a, null, { freeEnd: { x: 500, y: 300 } });
    // One routed endpoint (a) → routed geometry to the free end.
    const geom = resolveConnectorGeometry(dragging, record([a, dragging]));
    expect(geom).not.toBeNull();

    const orphan = connector(null, null);
    expect(resolveConnectorGeometry(orphan, record([orphan]))).toBeNull();
  });
});

describe('discovery connectors (straight, centre-to-centre)', () => {
  test('non-routed endpoints draw straight with a midpoint label', () => {
    const a = shapeFactory({ type: 'sticky', x: 0, y: 0, width: 210, height: 150 });
    const b = shapeFactory({ type: 'sticky', x: 400, y: 300, width: 210, height: 150 });
    const c = connector(a, b);
    const shapes = record([a, b, c]);

    expect(isDiscoveryConnector(c, shapes)).toBe(true);
    const geom = resolveConnectorGeometry(c, shapes);
    expect(geom?.points).toEqual([
      { x: 105, y: 75 },
      { x: 505, y: 375 },
    ]);
    expect(geom?.label).toEqual({ x: 305, y: 225 });
  });

  test('one routed endpoint upgrades the edge to the orthogonal router', () => {
    const stickyNote = shapeFactory({ type: 'sticky', x: 0, y: 0, width: 210, height: 150 });
    const c4 = node(600, 0);
    const c = connector(stickyNote, c4);
    const shapes = record([stickyNote, c4, c]);
    expect(isDiscoveryConnector(c, shapes)).toBe(false);
    const geom = resolveConnectorGeometry(c, shapes);
    expect(geom).toEqual(connectorGeometry(c, shapes));
  });

  test('straightConnectorGeometry uses freeEnd for a dangling end', () => {
    const a = shapeFactory({ type: 'sticky', x: 0, y: 0, width: 200, height: 100 });
    const c = connector(a, null, { freeEnd: { x: 400, y: 400 } });
    const geom = straightConnectorGeometry(c, record([a, c]));
    expect(geom?.points).toEqual([
      { x: 100, y: 50 },
      { x: 400, y: 400 },
    ]);
  });
});

describe('connectorAABB', () => {
  test('bounds the whole polyline', () => {
    const aabb = connectorAABB({
      points: [
        { x: 10, y: 40 },
        { x: 200, y: 40 },
        { x: 200, y: -30 },
      ],
      arrow: { x: 200, y: -30, angle: 0 },
      label: { x: 105, y: 40 },
    });
    expect(aabb).toEqual({ x: 10, y: -30, width: 190, height: 70 });
  });
});
