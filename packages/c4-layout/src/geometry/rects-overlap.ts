import type { Rect } from './rect.js';

/**
 * True when two axis-aligned rects overlap by any positive area. Edge-touch
 * (one rect's right edge exactly meeting another's left edge) is NOT an
 * overlap — the comparison is strict, matching how two adjacent, non-
 * overlapping node boxes are expected to butt up against each other.
 *
 * This is the single source of truth for "collision" in this package: the
 * pinning post-pass uses it to decide when an auto-placed node must move,
 * and the mixed-fixture test imports it directly to assert zero overlaps in
 * the final output.
 */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}
