import type { LayoutNode as LayoutNodePin } from '@workspec/c4-schema';
import { C4_NODE_HEIGHT, C4_NODE_WIDTH } from '../constants/node-size.js';
import type { LayoutPoint } from '../geometry/point.js';
import type { Rect } from '../geometry/rect.js';
import type { LayoutDirection } from '../model/layout-direction.js';
import { resolveAutoPlacement } from './nudge-node.js';

/** One node's final rect, plus whether it came from a `.layout/` pin. */
export interface ResolvedNodeRect extends Rect {
  readonly pinned: boolean;
}

/**
 * Merges elkjs's auto positions with `.layout/` pins into the final,
 * collision-free rect for every node — the one function both the
 * full-auto and full-manual cases run through, `pins` just happening to be
 * empty or complete respectively (see the package README's "Mixed mode"
 * section for why this is a single code path, not a branch per case).
 *
 * Pins are placed first, in the same deterministic sorted-`nodeId` order as
 * everything else, at their exact given coordinates — never nudged, never
 * overridden, regardless of what elkjs computed for that node. Unpinned
 * nodes are then placed in the same order, starting from their elkjs auto
 * position and nudged only far enough to clear whatever is already placed
 * (every pin, plus every unpinned node placed earlier in this pass) —
 * `resolveAutoPlacement` is what actually enforces zero overlaps.
 */
export function resolveNodeRects(
  nodeIds: readonly string[],
  autoPositions: ReadonlyMap<string, LayoutPoint>,
  pins: ReadonlyMap<string, LayoutNodePin>,
  direction: LayoutDirection,
): ReadonlyMap<string, ResolvedNodeRect> {
  const placed = new Map<string, Rect>();
  const resolved = new Map<string, ResolvedNodeRect>();

  for (const nodeId of nodeIds) {
    const pin = pins.get(nodeId);
    if (!pin) continue;
    const rect: Rect = {
      x: pin.x,
      y: pin.y,
      width: pin.width ?? C4_NODE_WIDTH,
      height: pin.height ?? C4_NODE_HEIGHT,
    };
    placed.set(nodeId, rect);
    resolved.set(nodeId, { ...rect, pinned: true });
  }

  for (const nodeId of nodeIds) {
    if (pins.has(nodeId)) continue;
    const auto = autoPositions.get(nodeId) ?? { x: 0, y: 0 };
    const size = { width: C4_NODE_WIDTH, height: C4_NODE_HEIGHT };
    const rect = resolveAutoPlacement(auto, size, placed, direction);
    placed.set(nodeId, rect);
    resolved.set(nodeId, { ...rect, pinned: false });
  }

  return resolved;
}
