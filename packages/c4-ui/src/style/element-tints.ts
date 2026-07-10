// The accent -> surface/border/eyebrow derivation percentages — sourced from
// @workspec/design's `--el-tint-*` tokens (the shared "typed element" grammar
// promoted there from this package so Decisions' option-card can use the
// exact same rule; see the Site Review UX pass, finding 02). Consumed by two
// renderers that must stay in sync:
// - `src/styles.css` declares the derivation as literal CSS
//   `color-mix(in oklab, ...)` rules on `.c4-node`, referencing the tokens
//   directly — nothing to keep in sync there, the browser resolves them.
// - `src/render-svg.ts` computes the equivalent mixes in code (via
//   `style/color-mix.ts`) because a standalone SVG's attributes cannot use
//   CSS `color-mix()`; `elementTintsFor` below reads the SAME tokens'
//   literal per-theme values for that computation, so there is one source
//   of truth (`@workspec/design`), not two hand-kept-in-sync ones.
//
// `accentLiftPct` is NOT one of the shared tokens: it's this package's own
// mechanism for adapting a single-value accent — a spec-defaults default or
// an author's spec.yaml override, either way one value that has to work on
// both themes — for the dark canvas. It stays local, unrelated to Decisions'
// grammar.

import type { ThemeName, TokenName } from '../themes.js';

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

const ACCENT_LIFT_PCT: Readonly<Record<ThemeName, number>> = { light: 0, dark: 22 };

function pct(value: string | undefined): number {
  const parsed = value !== undefined ? Number.parseFloat(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

/** This theme's derivation percentages, read from the supplied token map (`THEMES[theme]`). */
export function elementTintsFor(
  theme: ThemeName,
  tokens: Readonly<Record<TokenName, string>>,
): ElementTintSet {
  return {
    surfacePct: pct(tokens['--el-tint-surface']),
    borderPct: pct(tokens['--el-tint-border']),
    eyebrowPct: pct(tokens['--el-tint-eyebrow']),
    inkDimPct: pct(tokens['--el-tint-ink-dim']),
    accentLiftPct: ACCENT_LIFT_PCT[theme],
  };
}
