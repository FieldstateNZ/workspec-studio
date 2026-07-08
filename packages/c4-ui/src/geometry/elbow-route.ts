// Recomputes a single edge's route from two node rects, for the drag-to-pin
// interaction only: when a node moves, the edges touching it need a fresh
// route immediately (no waiting on a full `c4-layout` relayout pass) so the
// canvas stays visually consistent while dragging. `@workspec/c4-layout`
// does not export its own internal `elbowRoute` (it's routing, not the
// package's public API), so this mirrors that algorithm — documented in the
// fieldstate-c4-core skill as the same "exit trailing edge midpoint, enter
// leading edge midpoint, one mid-line bend if not already aligned"
// behaviour `@workspec/c4-layout`'s initial layout itself produces, so a
// dragged node's edges look identical in shape to a freshly auto-laid-out
// one. Not required to be the SAME module `render-svg.ts` imports (that
// module only ever draws a route `@workspec/c4-layout` or this function
// already computed) — it only needs to agree with it, which pinning this to
// the c4-layout source comment achieves.
import type { Rect } from './node-shape.js';

export interface EdgePoint {
  readonly x: number;
  readonly y: number;
}

function midpoint(a: number, b: number): number {
  return (a + b) / 2;
}

/** Direction the canvas lays out in — kept in sync with the `direction` passed to `c4-layout`'s `layoutDiagram`. */
export type ElbowDirection = 'LR' | 'TB';

/** Recomputes a deterministic orthogonal route between two rects, matching `@workspec/c4-layout`'s own routing shape. */
export function recomputeElbowRoute(from: Rect, to: Rect, direction: ElbowDirection): readonly EdgePoint[] {
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
