// The theme token source of truth, ported from the prototype's
// `console-dark.css` / `console-light.css` (WorkSpec "Console" idiom) with every
// token namespaced `--ds-*` so nothing collides with a host's own variables.
//
// `styles.css` re-declares these same values under `.ds-root[data-theme=…]` for
// pure-CSS theming. This module keeps them in TS as well so the values have a
// single canonical home and tests can assert the two themes actually differ.

/** The theme names shipped by the package. */
export type ThemeName = 'dark' | 'light';

/** The default theme when a host does not specify one. */
export const DEFAULT_THEME: ThemeName = 'dark';

/** The `--ds-*` token names the component styles reference. */
export type DsToken =
  | '--ds-bg'
  | '--ds-bg-soft'
  | '--ds-bg-elevated'
  | '--ds-line'
  | '--ds-line-2'
  | '--ds-ink'
  | '--ds-ink-soft'
  | '--ds-ink-muted'
  | '--ds-ink-fade'
  | '--ds-ink-ghost'
  | '--ds-accent'
  | '--ds-accent-deep'
  | '--ds-accent-soft'
  | '--ds-accent-mid'
  | '--ds-accent-wash'
  | '--ds-accent-hover'
  | '--ds-agent'
  | '--ds-agent-soft'
  | '--ds-agent-mid'
  | '--ds-warn'
  | '--ds-danger'
  | '--ds-danger-soft'
  | '--ds-on-accent'
  | '--ds-type-persona'
  | '--ds-type-feature'
  | '--ds-type-scenario'
  | '--ds-type-userreq'
  | '--ds-canvas-grid-minor'
  | '--ds-sans'
  | '--ds-mono'
  | '--ds-r-1'
  | '--ds-r-2'
  | '--ds-r-3'
  | '--ds-r-4'
  | '--ds-r-5'
  | '--ds-r-pill'
  | '--ds-sh-1'
  | '--ds-sh-2'
  | '--ds-sh-3'
  | '--ds-sh-glow'
  | '--ds-d-fast'
  | '--ds-d-base'
  | '--ds-d-slow'
  | '--ds-ease-out';

type ThemeTokens = Record<DsToken, string>;

const SHARED: Pick<
  ThemeTokens,
  | '--ds-sans'
  | '--ds-mono'
  | '--ds-r-1'
  | '--ds-r-2'
  | '--ds-r-3'
  | '--ds-r-4'
  | '--ds-r-5'
  | '--ds-r-pill'
  | '--ds-d-fast'
  | '--ds-d-base'
  | '--ds-d-slow'
  | '--ds-ease-out'
> = {
  '--ds-sans': "'Inter Tight', system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  '--ds-mono': "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
  '--ds-r-1': '3px',
  '--ds-r-2': '4px',
  '--ds-r-3': '6px',
  '--ds-r-4': '8px',
  '--ds-r-5': '12px',
  '--ds-r-pill': '99px',
  '--ds-d-fast': '120ms',
  '--ds-d-base': '180ms',
  '--ds-d-slow': '280ms',
  '--ds-ease-out': 'cubic-bezier(0.2, 0.7, 0.3, 1)',
};

/** Console · Dark tokens. */
export const DARK_THEME: ThemeTokens = {
  ...SHARED,
  '--ds-bg': '#0a0a0c',
  '--ds-bg-soft': '#16161a',
  '--ds-bg-elevated': '#1c1c22',
  '--ds-line': '#26262c',
  '--ds-line-2': '#34343d',
  '--ds-ink': '#e8e8ea',
  '--ds-ink-soft': '#a4a4ac',
  '--ds-ink-muted': '#72727a',
  '--ds-ink-fade': '#62626a',
  '--ds-ink-ghost': '#3a3a42',
  '--ds-accent': '#34d17f',
  '--ds-accent-deep': '#1b8a55',
  '--ds-accent-soft': 'rgba(52,209,127,0.14)',
  '--ds-accent-mid': 'rgba(52,209,127,0.35)',
  '--ds-accent-wash': 'rgba(52,209,127,0.06)',
  '--ds-accent-hover': '#52e891',
  '--ds-agent': '#5cf2c0',
  '--ds-agent-soft': 'rgba(92,242,192,0.10)',
  '--ds-agent-mid': 'rgba(92,242,192,0.4)',
  '--ds-warn': '#f2c94c',
  '--ds-danger': '#ff5a5a',
  '--ds-danger-soft': 'rgba(255,90,90,0.10)',
  '--ds-on-accent': '#0a0a0c',
  '--ds-type-persona': '#9ec6ff',
  '--ds-type-feature': '#5cf2c0',
  '--ds-type-scenario': '#f2c94c',
  '--ds-type-userreq': '#ff8e8e',
  '--ds-canvas-grid-minor': 'rgba(255,255,255,0.025)',
  '--ds-sh-1': '0 1px 0 rgba(0,0,0,0.4)',
  '--ds-sh-2': '0 2px 8px rgba(0,0,0,0.45)',
  '--ds-sh-3': '0 8px 24px rgba(0,0,0,0.5)',
  '--ds-sh-glow': '0 0 0 1px var(--ds-accent), 0 0 24px rgba(52,209,127,0.18)',
};

/** Console · Light tokens. */
export const LIGHT_THEME: ThemeTokens = {
  ...SHARED,
  '--ds-bg': '#f6f6f7',
  '--ds-bg-soft': '#fafafb',
  '--ds-bg-elevated': '#ffffff',
  '--ds-line': '#e4e4e7',
  '--ds-line-2': '#d1d1d6',
  '--ds-ink': '#0a0a0c',
  '--ds-ink-soft': '#4a4a52',
  '--ds-ink-muted': '#76767c',
  '--ds-ink-fade': '#76767c',
  '--ds-ink-ghost': '#b8b8be',
  '--ds-accent': '#1b8a55',
  '--ds-accent-deep': '#0e3b2a',
  '--ds-accent-soft': 'rgba(27,138,85,0.10)',
  '--ds-accent-mid': 'rgba(27,138,85,0.30)',
  '--ds-accent-wash': 'rgba(27,138,85,0.08)',
  '--ds-accent-hover': '#157849',
  '--ds-agent': '#0d8a72',
  '--ds-agent-soft': 'rgba(13,138,114,0.08)',
  '--ds-agent-mid': 'rgba(13,138,114,0.4)',
  '--ds-warn': '#c89216',
  '--ds-danger': '#c43a3a',
  '--ds-danger-soft': 'rgba(196,58,58,0.08)',
  '--ds-on-accent': '#ffffff',
  '--ds-type-persona': '#3a6ea5',
  '--ds-type-feature': '#1f8a6a',
  '--ds-type-scenario': '#a07a14',
  '--ds-type-userreq': '#b04848',
  '--ds-canvas-grid-minor': 'rgba(0,0,0,0.030)',
  '--ds-sh-1': '0 1px 0 rgba(0,0,0,0.06)',
  '--ds-sh-2': '0 2px 8px rgba(0,0,0,0.08)',
  '--ds-sh-3': '0 8px 24px rgba(0,0,0,0.10)',
  '--ds-sh-glow': '0 0 0 1px var(--ds-accent), 0 0 24px rgba(27,138,85,0.16)',
};

/** The two shipped themes, keyed by name. */
export const THEMES: Record<ThemeName, ThemeTokens> = {
  dark: DARK_THEME,
  light: LIGHT_THEME,
};

/**
 * The token map for a theme, as a React `style` object (CSS custom properties).
 * The provider applies this to its `.ds-root` element so theming is deterministic
 * even when the consumer has not imported `styles.css` (tests, some MF hosts).
 */
export function themeStyle(theme: ThemeName): Record<string, string> {
  return THEMES[theme];
}
