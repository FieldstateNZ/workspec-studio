import type { Shape, ShapeId } from '@workspec/canvas';
import { C4_BOUNDARY_PAD } from './shapes/c4-boundary-shape-util.js';

/**
 * Resize the derived C4 system boundary around its current contents.
 *
 * The projection tags the nodes that belong inside the boundary with
 * `meta.inBoundary`. Keeping this calculation separate from the generic
 * canvas store lets C4 diagrams reflow during a live drag without teaching
 * the whiteboard engine about C4-specific system semantics.
 *
 * Returns the original shape record when no geometry changed. That identity
 * guarantee is important for store subscribers: it prevents a reflow write
 * from recursively causing another reflow write.
 */
export function reflowC4Boundary(shapes: Record<ShapeId, Shape>): Record<ShapeId, Shape> {
  const boundary = Object.values(shapes).find((shape) => shape.type === 'c4boundary');
  if (!boundary) return shapes;

  const contents = Object.values(shapes).filter((shape) => shape.meta?.inBoundary === true);
  if (contents.length === 0) return shapes;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const shape of contents) {
    minX = Math.min(minX, shape.x);
    minY = Math.min(minY, shape.y);
    maxX = Math.max(maxX, shape.x + shape.width);
    maxY = Math.max(maxY, shape.y + shape.height);
  }

  const x = minX - C4_BOUNDARY_PAD;
  const y = minY - C4_BOUNDARY_PAD;
  const width = maxX - minX + C4_BOUNDARY_PAD * 2;
  const height = maxY - minY + C4_BOUNDARY_PAD * 2;
  if (
    boundary.x === x &&
    boundary.y === y &&
    boundary.width === width &&
    boundary.height === height
  ) {
    return shapes;
  }

  return {
    ...shapes,
    [boundary.id]: { ...boundary, x, y, width, height },
  };
}
