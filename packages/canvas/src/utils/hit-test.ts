import type { LensMode, Shape, ShapeId } from '../types.js';
import type { ShapeUtil } from '../shape-util.js';
import { effectivePosition, isHittableInLens } from './lens.js';
import { rotatePoint } from './geometry.js';

/**
 * Topmost shape (front-to-back by fractional index) under a page-space
 * point, honouring lens hittability, per-shape rotation and each shape's
 * util `hitTest`. The enterprise source carried three identical copies of
 * this loop (Canvas context menu, pointer hover tracking, select tool) —
 * consolidated here with unchanged behaviour.
 */
export function hitTestTopmost(
  pageX: number,
  pageY: number,
  shapes: Record<ShapeId, Shape>,
  lens: LensMode,
  getUtil: (type: string) => ShapeUtil | undefined,
): ShapeId | null {
  const sorted = Object.values(shapes).sort((a, b) => b.index.localeCompare(a.index));
  for (const shape of sorted) {
    const util = getUtil(shape.type);
    if (!util) continue;
    if (!isHittableInLens(shape, lens)) continue;
    const effPos = effectivePosition(shape, lens);
    const rot = shape.rotation ?? 0;
    let testX = pageX;
    let testY = pageY;
    if (rot !== 0) {
      const cx = effPos.x + shape.width / 2;
      const cy = effPos.y + shape.height / 2;
      const unrotated = rotatePoint(testX, testY, cx, cy, -rot);
      testX = unrotated.x;
      testY = unrotated.y;
    }
    if (util.hitTest(shape, { x: testX - effPos.x, y: testY - effPos.y })) {
      return shape.id;
    }
  }
  return null;
}
