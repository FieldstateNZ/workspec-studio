// Per-`DriftClass` glyph — the inline SVG shape drawn on every drift badge,
// panel chip, and node-detail drift box. Path data ported from the
// authoritative design's `driftGlyph(cls, size)` method (Topology Workbench
// (drift + cost).dc.html). Colour-blind-safe by construction: every class is
// a DISTINCT SHAPE (never hue alone) — `phantom` a dashed diamond, `orphan`
// a circle with a crosshair (paired with a dotted node-card border where
// this glyph badges a card — see `styles.css`), `miswired` a reroute arrow,
// `divergent` a two-bar split (the design's own fallback shape, which its
// `driftGlyph` happens to draw for every class besides the first three).

import type { ReactElement } from 'react';
import type { DriftClass } from '@workspec/topology-recon';

/** Props for {@link DriftGlyph}. */
export interface DriftGlyphProps {
  drift: DriftClass;
  /** Icon size in pixels (both width and height). Defaults to 14. */
  size?: number;
}

function PhantomShape(): ReactElement {
  return <path d="M12 3l8 9-8 9-8-9z" strokeDasharray="3 2.4" />;
}

function OrphanShape(): ReactElement {
  return (
    <>
      <circle cx={12} cy={12} r={8.5} strokeDasharray="1.5 3" />
      <path d="M12 8v8" />
      <path d="M8 12h8" />
    </>
  );
}

function MiswiredShape(): ReactElement {
  return (
    <>
      <path d="M4 8h9a4 4 0 0 1 0 8h-3" />
      <path d="M13 13l-3 3 3 3" />
      <path d="M20 6l-3.5 12" strokeWidth={1.6} />
    </>
  );
}

function DivergentShape(): ReactElement {
  return (
    <>
      <path d="M5 9h14" />
      <path d="M5 15h14" />
      <path d="M17 4L8 20" />
    </>
  );
}

const DRIFT_SHAPE: Record<DriftClass, () => ReactElement> = {
  phantom: PhantomShape,
  orphan: OrphanShape,
  miswired: MiswiredShape,
  divergent: DivergentShape,
};

/**
 * One drift class's shape, drawn at `size` pixels. Colour is deliberately
 * NOT set here — callers wrap this in an element whose `color` is the
 * class's accent token (see `drift-meta.ts`'s `driftColorVar`), so class
 * identity never rides on colour alone: shape, colour, AND the class label
 * are always present together wherever this renders.
 */
export function DriftGlyph(props: DriftGlyphProps): ReactElement {
  const size = props.size ?? 14;
  const Shape = DRIFT_SHAPE[props.drift];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <Shape />
    </svg>
  );
}
