// Deterministic layout for the Drift view's ORPHAN nodes — actual-only
// resources that exist nowhere in the authored tree, so `layoutLensTree`
// (which only knows the authored `LensTree`) has no rect for them at all.
// Laid out as one extra left-to-right row below the authored content's
// bounds, same card size as an authored node card — a simple, deterministic
// stand-in for the authoritative design's fixed hand-placed positions
// (`POS['diag-storage']`, `POS['backup-vault']`), which this package's
// actual input (an arbitrary `DerivedTopology`) carries no equivalent of.

import type { Rect } from './rect.js';

/** Same card footprint `fallback-layout.ts` uses for an authored node with no pinned position. */
const NODE_WIDTH = 176;
const NODE_HEIGHT = 56;
/** Vertical gap between the authored content and the orphan row. */
const ROW_GAP = 32;
/** Horizontal gap between orphan cards. */
const LANE_GAP = 16;
const MARGIN = 20;

/**
 * Lays out `orphanSlugs` as one row below `contentBounds`'s height,
 * returning a `slug -> Rect` map the same shape `layoutLensTree` produces —
 * callers merge it into the authored rects map so edge/ghost-edge lookups
 * and `NodeCard` placement treat orphan and authored cards uniformly.
 */
export function layoutOrphanRow(
  contentBounds: { readonly width: number; readonly height: number },
  orphanSlugs: readonly string[],
): ReadonlyMap<string, Rect> {
  const rects = new Map<string, Rect>();
  let cursorX = MARGIN;
  const y = contentBounds.height + ROW_GAP;

  for (const slug of orphanSlugs) {
    rects.set(slug, { x: cursorX, y, width: NODE_WIDTH, height: NODE_HEIGHT });
    cursorX += NODE_WIDTH + LANE_GAP;
  }

  return rects;
}
