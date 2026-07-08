// The accent→surface/border/eyebrow derivation percentages, mirroring
// WorkSpec Enterprise's `.c4-el` CSS token layer verbatim
// (`artifacts/workspec/src/index.css`, "C4 style-spec v2 token layer"):
// the node surface is a soft, neutral-dominant tint of the accent over
// `--bg-elevated`, the border is the accent at partial alpha, the eyebrow
// (kind text) is accent-dominant ink, and dark mode first lifts the accent
// toward white so it reads on the dark surface. Percentages are derivation
// DATA (Enterprise conformance, like style/spec-defaults.ts), not colours —
// the actual colour inputs are @workspec/design tokens and the spec-defaults
// accents.
//
// Consumed by two renderers that must stay in sync:
// - `src/styles.css` declares the same derivation as literal CSS
//   `color-mix(in oklab, ...)` rules on `.c4-node` (the interactive canvas)
//   — `element-tints.test.ts` asserts the stylesheet's percentages match
//   these constants, so they cannot silently drift.
// - `src/render-svg.ts` computes the equivalent mixes in code (via
//   `style/color-mix.ts`) because a standalone SVG's attributes cannot use
//   CSS `color-mix()`.

export interface ElementTintSet {
  /** Accent share of the node surface mix (rest is `--bg-elevated`). */
  readonly surfacePct: number;
  /** Accent alpha of the node border (a mix over transparent). */
  readonly borderPct: number;
  /** Accent share of the eyebrow/kind-text mix (rest is `--ink`); 100 = the accent itself. */
  readonly eyebrowPct: number;
  /** Ink alpha of the dimmed secondary text (description/technology). */
  readonly inkDimPct: number;
  /** How far the accent is lifted toward white before any other derivation (dark only). */
  readonly accentLiftPct: number;
}

export const ELEMENT_TINTS: Readonly<Record<'light' | 'dark', ElementTintSet>> = {
  light: { surfacePct: 9, borderPct: 28, eyebrowPct: 70, inkDimPct: 60, accentLiftPct: 0 },
  dark: { surfacePct: 14, borderPct: 34, eyebrowPct: 100, inkDimPct: 62, accentLiftPct: 22 },
};
