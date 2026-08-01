import type { BaseShape, Box, LensMode, Shape } from '../types.js';
import type { ShapeUtil } from '../shape-util.js';

/**
 * Returns the canvas position of a shape accounting for the active lens.
 * In structured lens, lensOffset (if set) is added to x/y so the item
 * "glides" to its loosened position without touching the stored x/y.
 */
export function effectivePosition(
  shape: Pick<BaseShape, 'x' | 'y' | 'lensOffset'>,
  lens: LensMode,
): { x: number; y: number } {
  if (lens === 'structured' && shape.lensOffset) {
    return { x: shape.x + shape.lensOffset.dx, y: shape.y + shape.lensOffset.dy };
  }
  return { x: shape.x, y: shape.y };
}

/**
 * Returns the axis-aligned bounding box of a shape accounting for the
 * active lens. Uses `util.getBounds()` when the shape's util is supplied
 * (live for connectors whose stored x/y/w/h are a coarse cache) and shifts
 * by the lens-offset delta so marquee selection stays spatially correct in
 * structured mode. The util is a parameter (not a module-level registry
 * read as in the enterprise source) because shape utils are
 * instance-scoped — resolve it via `instance.shapeUtils.get(shape.type)`.
 */
export function effectiveBounds(shape: Shape, lens: LensMode, util: ShapeUtil | undefined): Box {
  const raw: Box = util
    ? util.getBounds(shape)
    : { x: shape.x, y: shape.y, width: shape.width, height: shape.height };
  const effPos = effectivePosition(shape, lens);
  const dx = effPos.x - shape.x;
  const dy = effPos.y - shape.y;
  return { x: raw.x + dx, y: raw.y + dy, width: raw.width, height: raw.height };
}

/**
 * Returns false for shapes that should be invisible to hit-testing in the
 * given lens. In structured lens, draw strokes are visually ghosted and
 * must not intercept pointer events or manual hit-test queries.
 */
export function isHittableInLens(shape: Pick<BaseShape, 'type'>, lens: LensMode): boolean {
  return !(lens === 'structured' && shape.type === 'draw');
}
