// Orthogonal (Manhattan-elbow) edge routing between two rects — ported from
// the authoritative design's `ortho(a, b, o)` method (Topology
// Workbench.dc.html), which every declared edge (primary solid + telemetry
// faint dashed) routes through. The design's own edges also carried
// per-edge, HAND-TUNED channel offsets (its `STEPS`/`AUTH` arrays' `r: {ch,
// sOff, tOff, chy, vertical}` fields) authored specifically to avoid
// overlaps in that one fixture's fixed layout — `ResolvedConnection` (this
// package's actual input) carries no such per-edge routing metadata, so
// this port keeps the exact algorithm but takes its offsets as plain
// parameters a caller can compute generically (see `fan-edges.ts`, which
// fans same-endpoint edges apart automatically instead of requiring
// authored hints).

import type { Rect } from './rect.js';
import { rectCenter } from './rect.js';

/** Routing hints for {@link orthoPath}, mirroring the design's `ortho()` options object. */
export interface OrthoOptions {
  /** Force vertical (top/bottom exit) routing regardless of the dominant axis. */
  vertical?: boolean;
  /** The horizontal channel x-coordinate (horizontal routing). Defaults to the exit points' midpoint. */
  ch?: number;
  /** The vertical channel y-coordinate (vertical routing). Defaults to the exit points' midpoint. */
  chy?: number;
  /** Perpendicular offset applied to the source's exit point. */
  sOff?: number;
  /** Perpendicular offset applied to the target's entry point. */
  tOff?: number;
}

function fmt(x: number, y: number): string {
  return `${x.toFixed(1)} ${y.toFixed(1)}`;
}

/**
 * Builds an SVG path `d` string for a two-segment orthogonal elbow between
 * rect `a` (source) and rect `b` (target). Routes vertically (exiting
 * top/bottom) when `options.vertical` is set, or automatically when neither
 * `options.ch` is given nor the two centres are more horizontally than
 * vertically separated; otherwise routes horizontally (exiting left/right).
 */
export function orthoPath(a: Rect, b: Rect, options: OrthoOptions = {}): string {
  const centerA = rectCenter(a);
  const centerB = rectCenter(b);
  const dx = centerB.x - centerA.x;
  const dy = centerB.y - centerA.y;

  if (options.vertical === true || (options.ch === undefined && Math.abs(dy) > Math.abs(dx))) {
    const sx = centerA.x + (options.sOff ?? 0);
    const tx = centerB.x + (options.tOff ?? 0);
    const sy = dy > 0 ? a.y + a.height : a.y;
    const ty = dy > 0 ? b.y : b.y + b.height;
    const chy = options.chy ?? (sy + ty) / 2;
    return `M ${fmt(sx, sy)} L ${fmt(sx, chy)} L ${fmt(tx, chy)} L ${fmt(tx, ty)}`;
  }

  const sy = centerA.y + (options.sOff ?? 0);
  const ty = centerB.y + (options.tOff ?? 0);
  const sx = dx > 0 ? a.x + a.width : a.x;
  const tx = dx > 0 ? b.x : b.x + b.width;
  const ch = options.ch ?? (sx + tx) / 2;
  return `M ${fmt(sx, sy)} L ${fmt(ch, sy)} L ${fmt(ch, ty)} L ${fmt(tx, ty)}`;
}
