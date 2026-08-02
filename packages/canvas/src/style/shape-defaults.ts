// The ONE documented colour-VALUE exception to the zero-local-tokens house
// rule (epic #116 decision E; pattern mirrors packages/c4-ui's
// style/spec-defaults.ts exemption). Everything here is either
//
//   (a) PERSISTED DOCUMENT DATA — colours written INTO shape documents
//       (draw strokes, text colours). Documents outlive any theme, so these
//       must be concrete values, never `var(--*)` references that would
//       re-resolve differently per host; they are byte-identical to the
//       enterprise values so round-tripped documents match; or
//
//   (b) ANALOG-PAPER CONSTANTS — the sticky/photo "physical object" layer
//       (paper drop shadows, the photo-mount placeholder stripes, the
//       avatar white ring). The enterprise design keeps these
//       theme-INVARIANT on purpose: paper casts the same shadow in dark
//       mode, a photo print doesn't re-ink itself. Tokenising them would
//       change that deliberate behaviour.
//
// token-audit.test.ts exempts exactly this file (and style/local-tokens.css)
// from the raw-colour grep. Add nothing here without extending this header.

/**
 * Default freehand stroke colour (persisted into every DrawShape).
 * Enterprise `DrawShapeUtil.defaultProps` / `DrawTool` value.
 */
export const DRAW_DEFAULT_STROKE = '#1a1a1a';

/**
 * The context menu's text-colour swatches (persisted onto TextShape.color;
 * `undefined` = the theme's `var(--ink)` default). Enterprise
 * `ContextMenu.TEXT_COLORS` verbatim, minus the `var(--red,#e53e3e)`
 * default swatch (the swatch dot itself renders `var(--ink)`).
 */
export const TEXT_COLOR_SWATCHES: { value: string | undefined; label: string }[] = [
  { value: undefined, label: 'Default' },
  { value: '#ef4444', label: 'Red' },
  { value: '#f97316', label: 'Orange' },
  { value: '#eab308', label: 'Yellow' },
  { value: '#22c55e', label: 'Green' },
  { value: '#3b82f6', label: 'Blue' },
  { value: '#a855f7', label: 'Purple' },
];

/** Resting drop shadow of freeform sticky paper (analog constant, both themes). */
export const STICKY_PAPER_SHADOW = '0 2px 6px rgba(0,0,0,0.18), 0 10px 20px rgba(0,0,0,0.10)';

/** The photo-note placeholder mount stripes (analog constant). */
export const PHOTO_PLACEHOLDER_STRIPES =
  'repeating-linear-gradient(135deg, rgba(0,0,0,.06) 0 11px, rgba(0,0,0,.02) 11px 22px)';

/** White ring that lifts an author avatar off any paper colour (analog constant). */
export const AVATAR_RING_SHADOW = '0 0 0 1.5px rgba(255,255,255,0.5)';

/** Avatar initials ink — always white over the saturated identity fill. */
export const AVATAR_INK = '#fff';

/**
 * Deterministic identity fill for an author avatar: a fixed-saturation,
 * fixed-lightness HSL hue derived from the author id. A computed VALUE
 * (identity data), not a themeable style — enterprise formula verbatim.
 */
export function avatarFill(hue: number): string {
  return `hsl(${String(hue)} 55% 55%)`;
}
