// Computes the content bounding box of a positioned diagram's nodes, plus
// padding — the "compute the viewBox from actual content bounds, not a
// hardcoded number" rendering doctrine (fieldstate-c4-core skill). Shared by
// the interactive canvas (sizes the outer, fixed `viewBox`; pan/zoom then
// transforms a `<g>` inside it) and `render-svg.ts` (sizes the standalone
// SVG's `viewBox` the same way), so the two never disagree about how big a
// diagram's canvas is.

import type { Rect } from './node-shape.js';

export interface ContentBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly width: number;
  readonly height: number;
}

/** A degenerate/empty diagram's fallback canvas size. */
const EMPTY_WIDTH = 400;
const EMPTY_HEIGHT = 200;

/** Content bounds for a set of node rects, padded on every side. `padding` defaults to 40px. */
export function contentBounds(nodes: readonly Rect[], padding = 40): ContentBounds {
  if (nodes.length === 0) {
    return { minX: 0, minY: 0, maxX: EMPTY_WIDTH, maxY: EMPTY_HEIGHT, width: EMPTY_WIDTH, height: EMPTY_HEIGHT };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + node.width);
    maxY = Math.max(maxY, node.y + node.height);
  }

  const paddedMinX = minX - padding;
  const paddedMinY = minY - padding;
  const paddedMaxX = maxX + padding;
  const paddedMaxY = maxY + padding;
  return {
    minX: paddedMinX,
    minY: paddedMinY,
    maxX: paddedMaxX,
    maxY: paddedMaxY,
    width: paddedMaxX - paddedMinX,
    height: paddedMaxY - paddedMinY,
  };
}
