import type { LayoutPoint } from '../geometry/point.js';
import type { Rect } from '../geometry/rect.js';
import { rectsOverlap } from '../geometry/rects-overlap.js';
import type { LayoutDirection } from '../model/layout-direction.js';

/** Nudge increment, matching the node-node ELK spacing constant so nudged nodes still read as evenly spaced. */
const NUDGE_STEP = 40;

/** Deterministic search bound — generous for any realistic diagram; the fallback below guarantees termination regardless. */
const MAX_NUDGE_ATTEMPTS = 200;

function overlapsAny(candidate: Rect, placed: ReadonlyMap<string, Rect>): boolean {
  for (const rect of placed.values()) {
    if (rectsOverlap(candidate, rect)) return true;
  }
  return false;
}

/** The far edge of every placed rect along one axis — a position beyond this cannot overlap anything already placed. */
function farEdge(placed: ReadonlyMap<string, Rect>, axis: 'x' | 'y'): number {
  let max = 0;
  for (const rect of placed.values()) {
    const edge = axis === 'x' ? rect.x + rect.width : rect.y + rect.height;
    if (edge > max) max = edge;
  }
  return max;
}

/**
 * Finds a collision-free rect for one auto-placed node, starting from
 * elkjs's auto position and nudging along the axis perpendicular to the
 * layout's flow direction (Y for `'LR'`, X for `'TB'`) — the same axis
 * within-rank spacing already uses, so a nudge reads as "this node moved
 * over," not as a random jump. Search order (increasing magnitude,
 * alternating sign, checked against every already-placed rect in the same
 * deterministic pass order the caller iterates nodes in) never depends on
 * anything but its own inputs, so identical inputs always nudge identically.
 *
 * If nothing along the primary axis clears within `MAX_NUDGE_ATTEMPTS`
 * (pathological — dozens of nodes stacked on one pinned rect), the
 * deterministic fallback places the node just beyond every placed rect's
 * far edge along the *flow* axis, which by construction cannot overlap
 * anything already placed. This is what makes the pass total: it always
 * returns a collision-free rect, never throws.
 */
export function resolveAutoPlacement(
  auto: LayoutPoint,
  size: { readonly width: number; readonly height: number },
  placed: ReadonlyMap<string, Rect>,
  direction: LayoutDirection,
): Rect {
  const primaryAxis: 'x' | 'y' = direction === 'LR' ? 'y' : 'x';

  const initial: Rect = { x: auto.x, y: auto.y, ...size };
  if (!overlapsAny(initial, placed)) return initial;

  for (let attempt = 1; attempt <= MAX_NUDGE_ATTEMPTS; attempt += 1) {
    const magnitude = Math.ceil(attempt / 2) * NUDGE_STEP;
    const offset = (attempt % 2 === 1 ? 1 : -1) * magnitude;
    const candidate: Rect =
      primaryAxis === 'y' ? { x: auto.x, y: auto.y + offset, ...size } : { x: auto.x + offset, y: auto.y, ...size };
    if (!overlapsAny(candidate, placed)) return candidate;
  }

  const escapeAxis: 'x' | 'y' = primaryAxis === 'y' ? 'x' : 'y';
  const beyond = farEdge(placed, escapeAxis) + NUDGE_STEP;
  return escapeAxis === 'x' ? { x: beyond, y: auto.y, ...size } : { x: auto.x, y: beyond, ...size };
}
