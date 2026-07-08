import type { LayoutPoint } from '../geometry/point.js';
import type { Rect } from '../geometry/rect.js';
import type { LayoutDirection } from '../model/layout-direction.js';

function midpoint(a: number, b: number): number {
  return (a + b) / 2;
}

/**
 * Computes a deterministic orthogonal ("elbow") route from one node rect's
 * boundary to another's: exit at the midpoint of `from`'s trailing edge
 * (right for `'LR'`, bottom for `'TB'`), enter at the midpoint of `to`'s
 * leading edge, with a single mid-line bend when the two aren't already
 * aligned on the cross axis — a straight two-point line when they are.
 *
 * This is a pure function of the two final rects and the direction, not of
 * elkjs's own edge routing — see the package README's "Why not ELK for edge
 * routing" section for why: elkjs's routing is only trustworthy for a graph
 * it placed every node in itself, and pinned/nudged nodes routinely aren't
 * where elkjs put them. A route computed straight from the *final* rects is
 * simple, always consistent with the nodes it connects, and identical
 * whether every node is pinned, none are, or anything in between.
 */
export function elbowRoute(from: Rect, to: Rect, direction: LayoutDirection): readonly LayoutPoint[] {
  if (direction === 'LR') {
    const start = { x: from.x + from.width, y: from.y + from.height / 2 };
    const end = { x: to.x, y: to.y + to.height / 2 };
    if (start.y === end.y) return [start, end];
    const midX = midpoint(start.x, end.x);
    return [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end];
  }

  const start = { x: from.x + from.width / 2, y: from.y + from.height };
  const end = { x: to.x + to.width / 2, y: to.y };
  if (start.x === end.x) return [start, end];
  const midY = midpoint(start.y, end.y);
  return [start, { x: start.x, y: midY }, { x: end.x, y: midY }, end];
}
