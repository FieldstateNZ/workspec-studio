import type { ConnectorShape } from '../../shape-types.js';
import type { ShapeUtil } from '../../shape-util.js';
import type { Box, Shape, ShapeId, Vec2 } from '../../types.js';

// The orthogonal connector router — ported VERBATIM from the enterprise
// shapes/connector/geometry.ts (the parity crown jewel, #118). Pure over
// its inputs; the only S2 adaptation is `noUncheckedIndexedAccess` guards.
// The routed-kind and obstacle-kind sets keep the enterprise type names so
// re-adopted enterprise documents route identically; S3's shape modules
// carry the same names.

type Side = 'left' | 'right' | 'top' | 'bottom';
type FanRole = 'source-fan' | 'target-fan' | 'balanced';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Clamp the exit point into the middle of a side so it never slips onto a corner.
const SIDE_MARGIN = 18;
// Below this perpendicular/dominant ratio, treat the edge as axis-aligned.
const PERPENDICULAR_THRESHOLD = 0.15;
// Gap to leave between a detour leg and the node it routes around.
const ROUTE_CLEARANCE = 16;
// How far a detour steps straight out of the source/target face before turning,
// so the line always leaves and enters perpendicular to the box (arrow stays
// aligned with the face).
const STUB = 22;

function rectOf(shape: Shape): Rect {
  return { x: shape.x, y: shape.y, w: shape.width, h: shape.height };
}

function pointRect(p: Vec2): Rect {
  return { x: p.x, y: p.y, w: 0, h: 0 };
}

// Project the line from `box` centre toward `toward` onto `side`, clamped to the
// middle of that side. Ported from FloatingEdge.exitOnSide.
function exitOnSide(box: Rect, side: Side, toward: Vec2): Vec2 {
  const halfW = box.w / 2;
  const halfH = box.h / 2;
  const cx = box.x + halfW;
  const cy = box.y + halfH;
  const dx = toward.x - cx;
  const dy = toward.y - cy;

  if (side === 'right' || side === 'left') {
    const sx = side === 'right' ? cx + halfW : cx - halfW;
    const t = dx === 0 ? 0 : (sx - cx) / dx;
    const projectedY = cy + dy * t;
    const margin = Math.min(SIDE_MARGIN, halfH);
    const clampedY = Math.max(box.y + margin, Math.min(box.y + box.h - margin, projectedY));
    return { x: sx, y: clampedY };
  }
  const sy = side === 'bottom' ? cy + halfH : cy - halfH;
  const t = dy === 0 ? 0 : (sy - cy) / dy;
  const projectedX = cx + dx * t;
  const margin = Math.min(SIDE_MARGIN, halfW);
  const clampedX = Math.max(box.x + margin, Math.min(box.x + box.w - margin, projectedX));
  return { x: clampedX, y: sy };
}

interface EdgeParams {
  s: Vec2;
  t: Vec2;
  sourceSide: Side;
  targetSide: Side;
}

// Slide an exit point along its own face (perpendicular to the face normal) so
// edges sharing a face fan out instead of stacking on one point. Re-clamped to
// the face's safe span.
function offsetAlongFace(pt: Vec2, side: Side, box: Rect, offset: number): Vec2 {
  if (offset === 0) return pt;
  if (side === 'left' || side === 'right') {
    const margin = Math.min(SIDE_MARGIN, box.h / 2);
    const y = Math.max(box.y + margin, Math.min(box.y + box.h - margin, pt.y + offset));
    return { x: pt.x, y };
  }
  const margin = Math.min(SIDE_MARGIN, box.w / 2);
  const x = Math.max(box.x + margin, Math.min(box.x + box.w - margin, pt.x + offset));
  return { x, y: pt.y };
}

// Choose source/target faces by dominant axis + fan role, then project. Ported
// from FloatingEdge.getEdgeParams. laneOffset fans co-terminal edges across the
// shared face so parallel bundles don't collapse onto one anchor.
function getEdgeParams(
  source: Rect,
  target: Rect,
  fanRole: FanRole,
  laneOffset: number,
): EdgeParams {
  const sCenter = { x: source.x + source.w / 2, y: source.y + source.h / 2 };
  const tCenter = { x: target.x + target.w / 2, y: target.y + target.h / 2 };
  const dx = tCenter.x - sCenter.x;
  const dy = tCenter.y - sCenter.y;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  const ratio = absDx === 0 && absDy === 0 ? 0 : Math.min(absDx, absDy) / Math.max(absDx, absDy);
  const perpendicular = ratio >= PERPENDICULAR_THRESHOLD;

  let sourceSide: Side;
  let targetSide: Side;

  if (fanRole === 'target-fan' && perpendicular) {
    sourceSide = dx > 0 ? 'right' : 'left';
    targetSide = dy > 0 ? 'top' : 'bottom';
  } else if (fanRole === 'source-fan' && perpendicular) {
    sourceSide = dy > 0 ? 'bottom' : 'top';
    targetSide = dx > 0 ? 'left' : 'right';
  } else if (absDx >= absDy) {
    sourceSide = dx > 0 ? 'right' : 'left';
    targetSide = perpendicular ? (dy > 0 ? 'top' : 'bottom') : dx > 0 ? 'left' : 'right';
  } else {
    sourceSide = dy > 0 ? 'bottom' : 'top';
    targetSide = perpendicular ? (dx > 0 ? 'left' : 'right') : dy > 0 ? 'top' : 'bottom';
  }

  return {
    s: offsetAlongFace(exitOnSide(source, sourceSide, tCenter), sourceSide, source, laneOffset),
    t: offsetAlongFace(exitOnSide(target, targetSide, sCenter), targetSide, target, laneOffset),
    sourceSide,
    targetSide,
  };
}

// Arrow rotation (deg, SVG clockwise) so the tip points into the target face.
// Base arrow `M -8 -4 L 0 0 L -8 4 Z` points +X (right).
export function arrowAngleForSide(side: Side): number {
  switch (side) {
    case 'left':
      return 0;
    case 'right':
      return 180;
    case 'top':
      return 90;
    case 'bottom':
      return -90;
  }
}

function isHorizontal(side: Side): boolean {
  return side === 'left' || side === 'right';
}

// Orthogonal route between the two exit points. Z-shape when both ends face the
// same axis (lane offset spreads parallel bundles); L-shape when mixed.
function buildPolyline(p: EdgeParams, laneOffset: number): Vec2[] {
  const { s, t, sourceSide, targetSide } = p;
  const sH = isHorizontal(sourceSide);
  const tH = isHorizontal(targetSide);

  if (sH && tH) {
    const midX = (s.x + t.x) / 2 + laneOffset;
    return [s, { x: midX, y: s.y }, { x: midX, y: t.y }, t];
  }
  if (!sH && !tH) {
    const midY = (s.y + t.y) / 2 + laneOffset;
    return [s, { x: s.x, y: midY }, { x: t.x, y: midY }, t];
  }
  if (sH && !tH) {
    return [s, { x: t.x, y: s.y }, t];
  }
  return [s, { x: s.x, y: t.y }, t];
}

function dirOf(side: Side): Vec2 {
  switch (side) {
    case 'right':
      return { x: 1, y: 0 };
    case 'left':
      return { x: -1, y: 0 };
    case 'bottom':
      return { x: 0, y: 1 };
    case 'top':
      return { x: 0, y: -1 };
  }
}

// Our routes are axis-aligned, so a segment's bounding box IS the segment —
// rect-overlap is exact intersection. Strict comparisons so a line grazing a
// face (touching, not crossing) doesn't count as a hit.
function segHitsRect(a: Vec2, b: Vec2, r: Rect): boolean {
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  return minX < r.x + r.w && maxX > r.x && minY < r.y + r.h && maxY > r.y;
}

function polylineBlockers(points: Vec2[], obstacles: Rect[]): Rect[] {
  const hit: Rect[] = [];
  for (const r of obstacles) {
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      if (a && b && segHitsRect(a, b, r)) {
        hit.push(r);
        break;
      }
    }
  }
  return hit;
}

// Drop midpoints that are coincident or lie straight between their neighbours,
// so a detour reads as a clean elbow path.
function simplify(points: Vec2[]): Vec2[] {
  const first = points[0];
  const last = points[points.length - 1];
  if (points.length <= 2 || first === undefined || last === undefined) return points;
  const out: Vec2[] = [first];
  for (let i = 1; i < points.length - 1; i++) {
    const a = out[out.length - 1];
    const b = points[i];
    const c = points[i + 1];
    if (a === undefined || b === undefined || c === undefined) continue;
    const coincident = b.x === a.x && b.y === a.y;
    const collinear = (a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y);
    if (!coincident && !collinear) out.push(b);
  }
  out.push(last);
  return out;
}

function manhattanLength(points: Vec2[]): number {
  let d = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (a && b) d += Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
  }
  return d;
}

// Orthogonal route that dodges intervening nodes. The straight route is kept
// whenever it's already clear (no behaviour change, no cost for the common
// case); only a route that genuinely crosses a node is replaced — and only by a
// candidate verified collision-free, else we keep the straight one. Each
// candidate leaves the source and enters the target via a perpendicular stub so
// arrowheads stay aligned with the face.
function routeAvoiding(p: EdgeParams, laneOffset: number, obstacles: Rect[]): Vec2[] {
  const base = buildPolyline(p, laneOffset);
  if (obstacles.length === 0) return base;
  const blocking = polylineBlockers(base, obstacles);
  if (blocking.length === 0) return base;

  const { s, t, sourceSide, targetSide } = p;
  const sDir = dirOf(sourceSide);
  const tDir = dirOf(targetSide);
  const sStub: Vec2 = { x: s.x + sDir.x * STUB, y: s.y + sDir.y * STUB };
  const tStub: Vec2 = { x: t.x + tDir.x * STUB, y: t.y + tDir.y * STUB };

  // Detour lanes just clear of the blocking cluster, on each of its four sides.
  const top = Math.min(...blocking.map((r) => r.y)) - ROUTE_CLEARANCE;
  const bottom = Math.max(...blocking.map((r) => r.y + r.h)) + ROUTE_CLEARANCE;
  const left = Math.min(...blocking.map((r) => r.x)) - ROUTE_CLEARANCE;
  const right = Math.max(...blocking.map((r) => r.x + r.w)) + ROUTE_CLEARANCE;

  const candidates: Vec2[][] = [
    // Cross horizontally above / below the cluster.
    [s, sStub, { x: sStub.x, y: top }, { x: tStub.x, y: top }, tStub, t],
    [s, sStub, { x: sStub.x, y: bottom }, { x: tStub.x, y: bottom }, tStub, t],
    // Cross vertically left / right of the cluster.
    [s, sStub, { x: left, y: sStub.y }, { x: left, y: tStub.y }, tStub, t],
    [s, sStub, { x: right, y: sStub.y }, { x: right, y: tStub.y }, tStub, t],
  ];

  let best: Vec2[] | null = null;
  let bestCost = Infinity;
  for (const candidate of candidates) {
    const pts = simplify(candidate);
    // Re-check against ALL obstacles — the detour must not cross a different node.
    if (polylineBlockers(pts, obstacles).length > 0) continue;
    const cost = manhattanLength(pts) + pts.length * 24; // prefer short + few bends
    if (cost < bestCost) {
      bestCost = cost;
      best = pts;
    }
  }
  return best ?? base;
}

function polylineMidpoint(pts: Vec2[]): Vec2 {
  let total = 0;
  const segLens: number[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const len = a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0;
    segLens.push(len);
    total += len;
  }
  let target = total / 2;
  for (let i = 0; i < segLens.length; i++) {
    const segLen = segLens[i] ?? 0;
    const a = pts[i];
    const b = pts[i + 1];
    if ((target <= segLen || i === segLens.length - 1) && a && b) {
      const frac = segLen === 0 ? 0 : target / segLen;
      return {
        x: a.x + (b.x - a.x) * frac,
        y: a.y + (b.y - a.y) * frac,
      };
    }
    target -= segLen;
  }
  return pts[0] ?? { x: 0, y: 0 };
}


/**
 * Orthogonal polyline → SVG path with rounded corners (quadratic through
 * each bend) — the enterprise smoothstep look. `r` is in the caller's
 * coordinate space (the layer passes screen px, the standalone renderer
 * page px). Shared by ConnectorLayer and @workspec/c4-ui's renderSvg so
 * the two can never draw an elbow differently (#120).
 */
export function roundedConnectorPath(points: Vec2[], r: number): string {
  const first = points[0];
  const second = points[1];
  if (points.length < 2 || first === undefined || second === undefined) return '';
  if (points.length === 2) {
    return `M ${String(first.x)} ${String(first.y)} L ${String(second.x)} ${String(second.y)}`;
  }
  let d = `M ${String(first.x)} ${String(first.y)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    const next = points[i + 1];
    if (prev === undefined || cur === undefined || next === undefined) continue;
    const len1 = Math.hypot(prev.x - cur.x, prev.y - cur.y) || 1;
    const len2 = Math.hypot(next.x - cur.x, next.y - cur.y) || 1;
    const rr = Math.min(r, len1 / 2, len2 / 2);
    const p1 = {
      x: cur.x + ((prev.x - cur.x) / len1) * rr,
      y: cur.y + ((prev.y - cur.y) / len1) * rr,
    };
    const p2 = {
      x: cur.x + ((next.x - cur.x) / len2) * rr,
      y: cur.y + ((next.y - cur.y) / len2) * rr,
    };
    d += ` L ${String(p1.x)} ${String(p1.y)} Q ${String(cur.x)} ${String(cur.y)} ${String(p2.x)} ${String(p2.y)}`;
  }
  const last = points[points.length - 1];
  if (last) d += ` L ${String(last.x)} ${String(last.y)}`;
  return d;
}

export interface ConnectorGeometry {
  points: Vec2[];
  arrow: { x: number; y: number; angle: number };
  label: Vec2;
}

/**
 * Capability-driven routing membership (S2 debt, #119). Each callback may
 * return `undefined` = "no opinion", which falls back to the LEGACY
 * enterprise type-name sets below — so bare enterprise shape sets route
 * identically without registration changes, while registered modules opt
 * in explicitly via the `routedEdges` / `isRouteObstacle` ShapeUtil
 * capabilities.
 */
export interface ConnectorRoutingOpts {
  isRoutedEndpoint?: (shape: Shape) => boolean | undefined;
  isRouteObstacle?: (shape: Shape) => boolean | undefined;
}

/** Routing opts wired to an instance's shape-util registry (the standard caller). */
export function routingOptsFromUtils(
  getUtil: (type: string) => ShapeUtil | undefined,
): ConnectorRoutingOpts {
  return {
    isRoutedEndpoint: (s) => getUtil(s.type)?.routedEdges?.(s),
    isRouteObstacle: (s) => getUtil(s.type)?.isRouteObstacle?.(s),
  };
}

// The LEGACY shape kinds that form the orthogonally-routed graph (C4 /
// workflow / custom-diagram). A connector between any other kinds — Discovery
// sticky notes, cards — is a Discovery Board connector and draws straight
// (enterprise #363). Enterprise type names preserved (see file header).
const ROUTED_KINDS = new Set<string>(['c4node', 'diagram-node', 'workflownode']);

function isRoutedEndpoint(shape: Shape | undefined, opts?: ConnectorRoutingOpts): boolean {
  if (!shape) return false;
  return opts?.isRoutedEndpoint?.(shape) ?? ROUTED_KINDS.has(shape.type);
}

function isObstacle(shape: Shape, opts?: ConnectorRoutingOpts): boolean {
  return opts?.isRouteObstacle?.(shape) ?? shape.type === 'c4node';
}

// A connector is a Discovery (straight, centre-to-centre) connector unless at
// least one resolved endpoint is a routed graph node. Dangling/free ends fall
// through to Discovery so the rubber-band reads straight while dragging.
export function isDiscoveryConnector(
  shape: ConnectorShape,
  shapes: Record<ShapeId, Shape>,
  opts?: ConnectorRoutingOpts,
): boolean {
  const src = shape.sourceShapeId ? shapes[shape.sourceShapeId] : undefined;
  const tgt = shape.targetShapeId ? shapes[shape.targetShapeId] : undefined;
  return !isRoutedEndpoint(src, opts) && !isRoutedEndpoint(tgt, opts);
}

// Single entry point used by the layer and the shape util so hit-testing,
// bounds and rendering all agree on the same polyline.
export function resolveConnectorGeometry(
  shape: ConnectorShape,
  shapes: Record<ShapeId, Shape>,
  opts?: ConnectorRoutingOpts,
): ConnectorGeometry | null {
  return isDiscoveryConnector(shape, shapes, opts)
    ? straightConnectorGeometry(shape, shapes)
    : connectorGeometry(shape, shapes, opts);
}

// Live geometry in PAGE coordinates, resolved from the current endpoint shapes.
// Returns null when neither endpoint can be resolved (dangling connector).
export function connectorGeometry(
  shape: ConnectorShape,
  shapes: Record<ShapeId, Shape>,
  opts?: ConnectorRoutingOpts,
): ConnectorGeometry | null {
  const src = shape.sourceShapeId ? shapes[shape.sourceShapeId] : undefined;
  const tgt = shape.targetShapeId ? shapes[shape.targetShapeId] : undefined;

  const sRect = src ? rectOf(src) : shape.freeEnd ? pointRect(shape.freeEnd) : null;
  const tRect = tgt ? rectOf(tgt) : shape.freeEnd ? pointRect(shape.freeEnd) : null;
  if (!sRect || !tRect) return null;

  // laneOffset fans co-terminal edges across the shared face (in getEdgeParams),
  // so it's already baked into the anchors — the midline must not re-apply it.
  const params = getEdgeParams(sRect, tRect, shape.fanRole ?? 'balanced', shape.laneOffset ?? 0);

  // Obstacle shapes (capability-driven; legacy: C4 nodes) must be dodged.
  // Boundaries/containers are not — edges legitimately cross those. The two
  // endpoints are excluded.
  const obstacles: Rect[] = [];
  for (const o of Object.values(shapes)) {
    if (!isObstacle(o, opts)) continue;
    if (o.id === shape.sourceShapeId || o.id === shape.targetShapeId) continue;
    obstacles.push(rectOf(o));
  }

  const points = routeAvoiding(params, 0, obstacles);
  return {
    points,
    arrow: { x: params.t.x, y: params.t.y, angle: arrowAngleForSide(params.targetSide) },
    label: polylineMidpoint(points),
  };
}

// Discovery Board connectors (#363) draw a straight line between the two
// shapes' centre points (centre-to-centre is the accepted v1 anchoring) with
// the label at the geometric midpoint. No obstacle routing — Discovery notes
// don't form the orthogonal graph C4 nodes do.
export function straightConnectorGeometry(
  shape: ConnectorShape,
  shapes: Record<ShapeId, Shape>,
): ConnectorGeometry | null {
  const src = shape.sourceShapeId ? shapes[shape.sourceShapeId] : undefined;
  const tgt = shape.targetShapeId ? shapes[shape.targetShapeId] : undefined;

  const sCenter = src
    ? { x: src.x + src.width / 2, y: src.y + src.height / 2 }
    : (shape.freeEnd ?? null);
  const tCenter = tgt
    ? { x: tgt.x + tgt.width / 2, y: tgt.y + tgt.height / 2 }
    : (shape.freeEnd ?? null);
  if (!sCenter || !tCenter) return null;

  const points = [sCenter, tCenter];
  return {
    points,
    arrow: { x: tCenter.x, y: tCenter.y, angle: 0 },
    label: { x: (sCenter.x + tCenter.x) / 2, y: (sCenter.y + tCenter.y) / 2 },
  };
}

export function connectorAABB(geom: ConnectorGeometry): Box {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of geom.points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
