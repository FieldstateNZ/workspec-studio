import type { LayoutEdge as LayoutEdgeHint } from '@workspec/c4-schema';
import type { ResolvedDiagramEdge } from '@workspec/c4-model';
import { edgeKey } from '../sorting/edge-key.js';
import type { Rect } from '../geometry/rect.js';
import type { LayoutDirection } from '../model/layout-direction.js';
import type { PositionedEdge } from '../model/positioned-diagram.types.js';
import { elbowRoute } from './elbow-route.js';

/**
 * Routes every non-dangling edge: a `.layout/` waypoint hint, when its key
 * matches this edge, is passed through verbatim (authoritative — same
 * optionality contract as a pinned node); otherwise the route is computed
 * fresh from the edge's endpoints' final rects. Edges are expected already
 * sorted and already filtered to `!edge.dangling` by the caller —
 * `layoutDiagram` is where the "skip dangling, never throw" contract is
 * enforced (see the package README's "Dangling edges" section).
 */
export function resolveEdgeRoutes(
  edges: readonly ResolvedDiagramEdge[],
  rects: ReadonlyMap<string, Rect>,
  hints: ReadonlyMap<string, LayoutEdgeHint>,
  direction: LayoutDirection,
): readonly PositionedEdge[] {
  return edges.map((edge) => {
    const hint = hints.get(edgeKey(edge));
    if (hint) {
      return { ...edge, route: hint.waypoints };
    }

    const fromRect = rects.get(edge.from);
    const toRect = rects.get(edge.to);
    if (!fromRect || !toRect) {
      return { ...edge, route: [] };
    }

    return { ...edge, route: elbowRoute(fromRect, toRect, direction) };
  });
}
