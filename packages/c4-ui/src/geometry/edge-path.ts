// Edge path geometry: turns a `@workspec/c4-layout` `PositionedEdge.route`
// (an ordered orthogonal waypoint list) into SVG path data with rounded
// bends — the "orthogonal routing with curved bends" rendering doctrine
// (see the fieldstate-c4-core skill). Pure geometry, no styling — imported
// by BOTH `c4-canvas.tsx` and `render-svg.ts` so an edge is drawn identically
// in the interactive canvas and the standalone SVG output.

export interface EdgePoint {
  readonly x: number;
  readonly y: number;
}

/** Default corner radius for a routed edge's bends, matching the C4 rendering doctrine. */
export const EDGE_CORNER_RADIUS = 12;

function distance(a: EdgePoint, b: EdgePoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** A point exactly `amount` along the `from`→`to` segment (unclamped — `amount` must be within `[0, distance(from, to)]`). */
function pointAtDistance(from: EdgePoint, to: EdgePoint, amount: number): EdgePoint {
  const total = distance(from, to);
  if (total === 0) return from;
  const t = amount / total;
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
}

/** A point `amount` back from `corner` toward `endpoint`, clamped to at most half that segment's length — used to keep a rounded bend from overshooting past its own segment. */
function pointToward(corner: EdgePoint, endpoint: EdgePoint, amount: number): EdgePoint {
  const total = distance(corner, endpoint);
  return pointAtDistance(corner, endpoint, Math.min(amount, total / 2));
}

/**
 * Builds an SVG path `d` for an orthogonal route: straight segments between
 * waypoints, with each interior bend rounded by a quadratic Bézier of
 * `radius` (clamped to half the shorter adjacent segment, so a tight bend
 * never overshoots past the segment's own endpoints). A route of fewer than
 * three points has no interior bend and renders as a plain polyline/line.
 */
export function orthogonalEdgePath(
  route: readonly EdgePoint[],
  radius = EDGE_CORNER_RADIUS,
): string {
  if (route.length === 0) return '';
  if (route.length <= 2) {
    return route.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  }

  const first = route[0] as EdgePoint;
  const segments: string[] = [`M ${first.x} ${first.y}`];

  for (let i = 1; i < route.length - 1; i += 1) {
    const prev = route[i - 1] as EdgePoint;
    const corner = route[i] as EdgePoint;
    const next = route[i + 1] as EdgePoint;
    const entry = pointToward(corner, prev, radius);
    const exit = pointToward(corner, next, radius);
    segments.push(`L ${entry.x} ${entry.y}`, `Q ${corner.x} ${corner.y} ${exit.x} ${exit.y}`);
  }

  const last = route[route.length - 1] as EdgePoint;
  segments.push(`L ${last.x} ${last.y}`);
  return segments.join(' ');
}

/**
 * The route's total midpoint (walking cumulative segment length to the 50%
 * mark), for centring a relationship label — the "label sits at the
 * midpoint of the path" rendering doctrine.
 */
export function routeMidpoint(route: readonly EdgePoint[]): EdgePoint {
  if (route.length === 0) return { x: 0, y: 0 };
  if (route.length === 1) return route[0] as EdgePoint;

  const lengths: number[] = [];
  let total = 0;
  for (let i = 1; i < route.length; i += 1) {
    const segLength = distance(route[i - 1] as EdgePoint, route[i] as EdgePoint);
    lengths.push(segLength);
    total += segLength;
  }
  if (total === 0) return route[0] as EdgePoint;

  const target = total / 2;
  let walked = 0;
  for (let i = 0; i < lengths.length; i += 1) {
    const segLength = lengths[i] as number;
    if (walked + segLength >= target) {
      const remaining = target - walked;
      return pointAtDistance(route[i] as EdgePoint, route[i + 1] as EdgePoint, remaining);
    }
    walked += segLength;
  }
  return route[route.length - 1] as EdgePoint;
}
