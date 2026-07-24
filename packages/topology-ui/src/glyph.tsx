// Per-`ResourceKind` glyph — the inline SVG icon drawn on every node card,
// boundary box, resource-list row, and the detail panel's header. Path data
// is REUSED VERBATIM from the authoritative design
// (Topology Workbench.dc.html's `glyph(kind, size)` method) — WorkSpec owns
// these glyphs, so this is a direct, license-safe port, not a redraw.
//
// One addition beyond the design: `edge` (Azure Front Door's `ResourceKind`
// in the golden web-app fixture) has no glyph in the source design, which
// only draws the 12 kinds its own demo data exercises. A small broadcast/
// signal mark was added for it (judgment call — see this package's
// implementation report) so Front Door reads as its own thing rather than
// falling back to a generic box. Any kind outside this file's map (the
// schema's `search`/`storage`/`vault`, or a future addition) falls back to
// the `compute` glyph, mirroring the design's own `g[kind] || g.compute`
// fallback rule.

import type { ReactElement } from 'react';
import type { ResourceKindType } from '@workspec/topology-schema';

/** Props for {@link Glyph}. */
export interface GlyphProps {
  kind: ResourceKindType;
  /** Icon size in pixels (both width and height — the glyphs are square). Defaults to 20. */
  size?: number;
}

const GLYPH_PATHS: Partial<Record<ResourceKindType, () => ReactElement>> = {
  client: () => (
    <>
      <rect x={3} y={5} width={18} height={12} rx={2} />
      <path d="M8 21h8" />
      <path d="M12 17v4" />
    </>
  ),
  gateway: () => <path d="M12 3l7 3v5c0 4.2-3 7.4-7 9-4-1.6-7-4.8-7-9V6z" />,
  compute: () => (
    <>
      <rect x={4} y={5} width={16} height={4.2} rx={1} />
      <rect x={4} y={14} width={16} height={4.2} rx={1} />
      <circle cx={7.5} cy={7.1} r={0.6} fill="currentColor" />
      <circle cx={7.5} cy={16.1} r={0.6} fill="currentColor" />
    </>
  ),
  function: () => <path d="M13 2L5 13h5l-1 9 8-12h-5l1-8z" />,
  cache: () => (
    <>
      <circle cx={12} cy={12} r={8.3} />
      <path d="M12.5 7l-3 5.2h2.6L11 17l4-5.6h-2.6z" />
    </>
  ),
  database: () => (
    <>
      <ellipse cx={12} cy={6} rx={7} ry={2.7} />
      <path d="M5 6v12c0 1.5 3.1 2.7 7 2.7s7-1.2 7-2.7V6" />
      <path d="M5 12c0 1.5 3.1 2.7 7 2.7s7-1.2 7-2.7" />
    </>
  ),
  endpoint: () => (
    <>
      <rect x={6} y={11} width={12} height={8} rx={1.5} />
      <path d="M9 11V8.5a3 3 0 0 1 6 0V11" />
      <circle cx={12} cy={15} r={1.1} fill="currentColor" />
    </>
  ),
  identity: () => (
    <>
      <circle cx={8} cy={9} r={3.4} />
      <path d="M10.4 11.4L19 20" />
      <path d="M16 17l2-2" />
      <path d="M18.5 14.5l1.5-1.5" />
    </>
  ),
  vnet: () => <path d="M12 3l7.5 4.2v9L12 20.5 4.5 16.2v-9z" />,
  'resource-group': () => (
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  ),
  monitor: () => (
    <>
      <path d="M4 15a8 8 0 0 1 16 0" />
      <path d="M12 15l4-3" />
      <circle cx={12} cy={15} r={1.1} fill="currentColor" />
    </>
  ),
  subnet: () => (
    <>
      <rect x={4} y={4} width={7} height={7} rx={1} />
      <rect x={13} y={4} width={7} height={7} rx={1} />
      <rect x={4} y={13} width={7} height={7} rx={1} />
      <rect x={13} y={13} width={7} height={7} rx={1} />
    </>
  ),
  // Not in the source design — see this file's header comment.
  edge: () => (
    <>
      <path d="M4 18a10 10 0 0 1 16 0" />
      <path d="M7 18a6 6 0 0 1 10 0" />
      <circle cx={12} cy={18} r={1.3} fill="currentColor" />
    </>
  ),
};

/**
 * One resource kind's icon, drawn at `size` pixels. Colour is deliberately
 * NOT set here — callers wrap this in an element whose `color` is the
 * kind's accent token (see `kind-meta.ts`'s `kindColorVar`), and every path
 * below uses `stroke="currentColor"` (inherited from the wrapper), so kind
 * identity never rides on colour ALONE — the glyph's SHAPE plus the kind
 * label next to it are both always present too.
 */
export function Glyph(props: GlyphProps): ReactElement {
  const size = props.size ?? 20;
  const draw = GLYPH_PATHS[props.kind] ?? GLYPH_PATHS.compute;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {draw?.()}
    </svg>
  );
}
