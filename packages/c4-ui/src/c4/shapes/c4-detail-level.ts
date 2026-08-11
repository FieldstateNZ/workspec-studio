import { useCanvasStore } from '@workspec/canvas';

// Low-zoom level of detail for the C4 card (#134). Ported from the
// enterprise canvas, where SEVEN card families (artifactcard, boardcard,
// entitycard, journeycard, workflownode, groupframe, atlassuggestion) all
// carry the same two-tier ladder:
//
//   zoom < 0.35  → a flat accent bar (no text at all)
//   zoom < 0.6   → title only (type eyebrow + name, no body chrome)
//   otherwise    → the full card
//
// Enterprise never put it on its C4 card because its C4 diagrams never zoom
// that far out. The studio's do: a cold auto-layout of the dogfood container
// tree fits at ~0.34–0.58, where the card's 15px title renders at 5–9px and
// the 10px eyebrow at 3.4px. Same idiom, a surface that needed it.

/** Below this zoom the card renders as a flat accent bar — no text. */
export const C4_LOD_FLAT_ZOOM = 0.35;

/** Below this zoom the card renders type + name only, no body chrome. */
export const C4_LOD_TITLE_ZOOM = 0.6;

/**
 * How much of the C4 card is worth drawing at a given camera zoom.
 * `'flat'` is a bar, `'title'` is type + name, `'full'` is the whole card.
 */
export type C4DetailLevel = 'flat' | 'title' | 'full';

/**
 * Pure zoom → detail-level mapping. Split out from the hook so the ladder
 * is unit-testable without a canvas store, and so the two low-detail
 * renderings and the card agree on one set of thresholds.
 */
export function detailLevelForZoom(zoom: number): C4DetailLevel {
  if (zoom < C4_LOD_FLAT_ZOOM) return 'flat';
  if (zoom < C4_LOD_TITLE_ZOOM) return 'title';
  return 'full';
}

/**
 * Subscribe to the camera's detail level.
 *
 * Deliberately selects the QUANTISED bucket rather than the raw
 * `camera.zoom` the enterprise cards read. Zustand compares selector
 * results with `Object.is`, so returning one of three string literals
 * re-renders every card only when the bucket actually flips — whereas
 * enterprise's raw-zoom selector re-renders every card on every wheel tick
 * of a pinch-zoom. Same rendered result, without the re-render storm.
 */
export function useC4DetailLevel(): C4DetailLevel {
  return useCanvasStore((s) => detailLevelForZoom(s.camera.zoom));
}
