// Theme surface for the package. Since S10 (#8) the tokens are OWNED by
// @workspec/design — this module only maps the provider's two-value `theme`
// prop ('dark' | 'light') onto that package's theme identifiers and re-exports
// the pieces the views and hosts need. No token values live in this repo.

import { THEME_TOKENS, themeStyle as designThemeStyle } from '@workspec/design';
import type { ThemeName as DesignThemeName, TokenName } from '@workspec/design';

/** The name of a WorkSpec design token (`--bg`, `--ink`, `--accent`, …). */
export type { TokenName };

/** The theme names the provider's `theme` prop accepts. */
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
 * A theme's token map as a React `style` object (CSS custom properties). The
 * provider applies this inline on its `.ds-root` element, so the WorkSpec
 * palette is bound wherever the views render — no document-level
 * `data-aesthetic`/`data-theme` attributes or imported theme CSS required.
 */
export function themeStyle(theme: ThemeName): Record<string, string> {
  return designThemeStyle(DESIGN_THEMES[theme]);
}
