// Node outline geometry: turns a node's rect + resolved `shape` (box |
// cylinder | pill | hexagon — see style/spec-defaults.ts) into SVG path
// data. Pure geometry, no styling (fill/stroke/accent) — imported by BOTH
// `c4-canvas.tsx` (the interactive React renderer) and `render-svg.ts` (the
// standalone string renderer) so the two paths can never draw a node
// differently. `box`/`pill` need no path at all (a plain `<rect rx>` renders
// both natively in every SVG consumer); `cylinder`/`hexagon` have no native
// SVG primitive, so those return real path data.
//
// The corner radius / cap-height constants below are geometry, not colour —
// the zero-local-tokens rule (`zero-local-tokens.test.ts`) is scoped to hex/
// hsl colour literals, the same way `@workspec/c4-layout`'s
// `C4_NODE_WIDTH`/`C4_NODE_HEIGHT` are plain numeric constants rather than
// design tokens.

import type { ElementShape } from '../style/spec-defaults.js';

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Corner radius for a `box`-shaped node, matching the C4 rendering doctrine's rounded-rectangle convention. */
export const BOX_CORNER_RADIUS = 10;

/** Cap ellipse height for a `cylinder`-shaped node, clamped so a short/pinned node never degenerates. */
function cylinderCapHeight(height: number): number {
  return Math.max(6, Math.min(height * 0.2, 18));
}

export type NodeShapeGeometry =
  | { readonly kind: 'rect'; readonly rx: number; readonly ry: number }
  | { readonly kind: 'path'; readonly outline: string; readonly decoration?: string };

function cylinderGeometry(rect: Rect): NodeShapeGeometry {
  const { x, y, width, height } = rect;
  const rx = width / 2;
  const ry = cylinderCapHeight(height);
  const top = y + ry;
  const bottom = y + height - ry;

  // Outline: left side down, bottom arc (front, visible), right side up, then
  // the BACK half of the top ellipse (sweep 0) closes the silhouette — this
  // is the shape that gets filled + stroked.
  const outline = [
    `M ${x} ${top}`,
    `L ${x} ${bottom}`,
    `A ${rx} ${ry} 0 0 0 ${x + width} ${bottom}`,
    `L ${x + width} ${top}`,
    `A ${rx} ${ry} 0 0 0 ${x} ${top}`,
    'Z',
  ].join(' ');

  // Decoration: the FRONT half of the top ellipse (sweep 1) — the visible
  // "lid seam" line drawn stroke-only, no fill, on top of the outline.
  const decoration = [`M ${x} ${top}`, `A ${rx} ${ry} 0 0 1 ${x + width} ${top}`].join(' ');

  return { kind: 'path', outline, decoration };
}

function hexagonGeometry(rect: Rect): NodeShapeGeometry {
  const { x, y, width, height } = rect;
  const cut = Math.min(width, height) * 0.2;
  const outline = [
    `M ${x + cut} ${y}`,
    `L ${x + width - cut} ${y}`,
    `L ${x + width} ${y + height / 2}`,
    `L ${x + width - cut} ${y + height}`,
    `L ${x + cut} ${y + height}`,
    `L ${x} ${y + height / 2}`,
    'Z',
  ].join(' ');
  return { kind: 'path', outline };
}

/** The outline geometry for one node's rect under its resolved shape. */
export function nodeShapeGeometry(rect: Rect, shape: ElementShape): NodeShapeGeometry {
  switch (shape) {
    case 'cylinder':
      return cylinderGeometry(rect);
    case 'hexagon':
      return hexagonGeometry(rect);
    case 'pill':
      return { kind: 'rect', rx: rect.height / 2, ry: rect.height / 2 };
    case 'box':
    default:
      return { kind: 'rect', rx: BOX_CORNER_RADIUS, ry: BOX_CORNER_RADIUS };
  }
}
