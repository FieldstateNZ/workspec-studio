// Theme surface for the package. The tokens are OWNED by `@workspec/design`
// — this module only maps the provider's two-value `theme` prop
// ('dark' | 'light') onto that package's theme identifiers and re-exports the
// pieces the provider needs. No token values live in this repo. Mirrors
// `@workspec/cost-ui`'s `themes.ts` exactly.

import { THEME_TOKENS, themeStyle as designThemeStyle } from '@workspec/design';
import type { ThemeName as DesignThemeName, TokenName } from '@workspec/design';

/** The name of a WorkSpec design token (`--bg`, `--ink`, `--accent`, …). */
export type { TokenName };

/** The theme names trace-ui's `theme` props accept. */
export type ThemeName = 'dark' | 'light';

/** The default theme when a host does not specify one. */
export const DEFAULT_THEME: ThemeName = 'dark';

/** The `@workspec/design` theme identifier behind each `theme` prop value. */
export const DESIGN_THEMES: Record<ThemeName, DesignThemeName> = {
  dark: 'console-dark',
  light: 'console-light',
};

/** Each theme's full WorkSpec token map, keyed by the `theme` prop value. */
export const THEMES: Record<ThemeName, Readonly<Record<TokenName, string>>> = {
  dark: THEME_TOKENS['console-dark'],
  light: THEME_TOKENS['console-light'],
};

/**
 * A theme's tokens as a plain, mutable object suitable for a React inline
 * `style` prop, e.g. `<div style={themeStyle('dark') as React.CSSProperties}>`.
 */
export function themeStyle(theme: ThemeName): Record<string, string> {
  return designThemeStyle(DESIGN_THEMES[theme]);
}
