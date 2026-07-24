// Deterministic auto-layout for a lens tree, used wherever an entry has no
// pinned `.layout/` position — the "SIMPLE DETERMINISTIC fallback layout
// (columnar by container)" the canvas needs so it always renders, even for
// a tree with no `.layout/` file at all (today's only case: none of the
// golden web-app fixture's `.workspec/topologies/.layout/` files exist).
//
// Algorithm: top-level entries are laid out left-to-right as lanes; a
// container lays its own children out top-to-bottom as a column, indented
// inside its own box, and the container's box then sizes itself to its
// children's bounding box (or a minimum size, if it has none). Nesting
// (vnet > subnet > nodes) recurses the same rule at every depth.
//
// An entry with an AUTHORED position (joined in by
// `joinPositionsToLensTree`) is placed at that exact `x`/`y` instead of the
// auto cursor's — but the auto cursor for its UNPOSITIONED siblings still
// advances by that entry's height, so a fully unauthored tree (this
// package's only tested case today) degenerates to pure auto-layout, while
// a future partially-pinned tree at least never overlaps two AUTO entries.
// Known limitation (documented, not solved here): an authored entry is not
// reserved space against — it can still overlap an auto-placed sibling.
// Resolving that needs a real constraint layout, out of scope for this v0
// "simple design" slice.

import type { LensContainer, LensEntry, LensNode, LensPosition } from '@workspec/topology-model';
import type { Rect } from './rect.js';

/** Default size for a node card with no pinned `width`/`height`. */
const NODE_WIDTH = 176;
const NODE_HEIGHT = 56;

/** Space reserved for a container's label row before its first child. */
const CONTAINER_HEADER = 34;
/** Padding between a container's border and its children on every side. */
const CONTAINER_PADDING = 14;
/** Vertical gap between a container's stacked children. */
const CHILD_GAP = 12;
/** Horizontal gap between top-level lanes. */
const LANE_GAP = 28;
/** Canvas margin the first lane starts at. */
const MARGIN = 20;
/** Minimum box size for an empty container. */
const MIN_CONTAINER_WIDTH = 200;
const MIN_CONTAINER_HEIGHT = CONTAINER_HEADER + CONTAINER_PADDING * 2;

function positionToRect(
  position: LensPosition | null,
  defaultWidth: number,
  defaultHeight: number,
): Rect | null {
  if (position === null) return null;
  return {
    x: position.x,
    y: position.y,
    width: position.width ?? defaultWidth,
    height: position.height ?? defaultHeight,
  };
}

interface LayoutResult {
  readonly rect: Rect;
  readonly rectsBySlug: ReadonlyMap<string, Rect>;
}

function layoutNodeEntry(node: LensNode, cursorX: number, cursorY: number): LayoutResult {
  const authored = positionToRect(node.position, NODE_WIDTH, NODE_HEIGHT);
  const rect = authored ?? { x: cursorX, y: cursorY, width: NODE_WIDTH, height: NODE_HEIGHT };
  return { rect, rectsBySlug: new Map([[node.slug, rect]]) };
}

function layoutContainerEntry(
  container: LensContainer,
  cursorX: number,
  cursorY: number,
): LayoutResult {
  const authoredOuter = positionToRect(container.position, 0, 0);
  const originX = authoredOuter?.x ?? cursorX;
  const originY = authoredOuter?.y ?? cursorY;

  const rectsBySlug = new Map<string, Rect>();
  let childCursorY = originY + CONTAINER_HEADER;
  let maxChildWidth = 0;

  for (const child of container.children) {
    const childResult = layoutEntry(child, originX + CONTAINER_PADDING, childCursorY);
    for (const [slug, rect] of childResult.rectsBySlug) rectsBySlug.set(slug, rect);
    maxChildWidth = Math.max(maxChildWidth, childResult.rect.width);
    childCursorY += childResult.rect.height + CHILD_GAP;
  }
  if (container.children.length > 0) childCursorY -= CHILD_GAP;

  const innerHeight = childCursorY - (originY + CONTAINER_HEADER);
  const computedWidth = Math.max(maxChildWidth + CONTAINER_PADDING * 2, MIN_CONTAINER_WIDTH);
  const computedHeight = Math.max(
    CONTAINER_HEADER + innerHeight + CONTAINER_PADDING,
    MIN_CONTAINER_HEIGHT,
  );

  const rect: Rect = {
    x: originX,
    y: originY,
    width: authoredOuter?.width ?? computedWidth,
    height: authoredOuter?.height ?? computedHeight,
  };
  rectsBySlug.set(container.slug, rect);
  return { rect, rectsBySlug };
}

function layoutEntry(entry: LensEntry, cursorX: number, cursorY: number): LayoutResult {
  return entry.type === 'node'
    ? layoutNodeEntry(entry.node, cursorX, cursorY)
    : layoutContainerEntry(entry.container, cursorX, cursorY);
}

/**
 * Lays out every entry in a lens tree's `roots` (recursively, through every
 * nested container), returning a flat `slug -> Rect` map the canvas looks
 * up both node cards and boundary boxes from. Top-level roots become
 * left-to-right lanes; deterministic — the same tree always produces the
 * same rects, so re-renders never jitter.
 */
export function layoutLensTree(roots: readonly LensEntry[]): ReadonlyMap<string, Rect> {
  const rectsBySlug = new Map<string, Rect>();
  let cursorX = MARGIN;

  for (const root of roots) {
    const result = layoutEntry(root, cursorX, MARGIN);
    for (const [slug, rect] of result.rectsBySlug) rectsBySlug.set(slug, rect);
    cursorX += result.rect.width + LANE_GAP;
  }

  return rectsBySlug;
}

/** The overall canvas content size a set of laid-out rects needs, plus a margin — used to size the scrollable canvas surface. */
export function contentBounds(rects: ReadonlyMap<string, Rect>): { width: number; height: number } {
  let maxX = 0;
  let maxY = 0;
  for (const rect of rects.values()) {
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
  }
  return { width: maxX + MARGIN, height: maxY + MARGIN };
}
