// @workspec/c4-ui — host-agnostic React components for interactive WorkSpec
// C4 diagrams (standalone lib + module-federation remote).
//
// Components receive already-loaded `@workspec/c4-model`/`@workspec/c4-layout`
// data as props — there is no repository fetch, no global, no ambient theme.
// `C4Diagram` renders one positioned diagram view; `C4Explorer` adds tree
// navigation and per-diagram layout orchestration over a whole `C4Model`.
// `renderSvg` produces a standalone, deterministic SVG string from the same
// geometry/style modules the interactive canvas uses.
//
// Styles ship compiled and separate: import `@workspec/c4-ui/styles.css`.

// ── Host contract ─────────────────────────────────────────────────────────────
export { createInertLinkResolver } from './host.js';
export type {
  C4StudioHost,
  C4StudioCapabilities,
  LinkResolver,
  LinkResolution,
  LinkTarget,
} from './host.js';

// ── Element link parsing (for hosts that want to render an element's `links` field themselves) ──
export { parseLinkEntries, parseLinkEntry, LinksBlock } from './links.js';

// ── Element lookup key (kind + slug — matches how `elementsByKindAndSlug` is keyed) ──
export { elementKey } from './element-key.js';

// ── Components ──────────────────────────────────────────────────────────────
export { C4Diagram } from './c4-diagram.js';
export type { C4DiagramProps } from './c4-diagram.js';
export { C4Explorer } from './c4-explorer.js';
export type { C4ExplorerProps } from './c4-explorer.js';

// ── Standalone SVG rendering ────────────────────────────────────────────────
export { renderSvg } from './render-svg.js';
export type { RenderSvgOptions } from './render-svg.js';

// ── Style resolution (Enterprise defaults + spec.yaml overrides) ───────────────
export {
  DEFAULT_ELEMENT_STYLES,
  DEFAULT_CONNECTION_STYLES,
  resolveElementStyle,
  resolveConnectionStyle,
} from './style/spec-defaults.js';
export type {
  ElementShape,
  ConnectionLineStyle,
  ResolvedElementStyle,
  ResolvedConnectionStyle,
} from './style/spec-defaults.js';

// ── Theming (WorkSpec design tokens, owned by @workspec/design) ───────────────
export { DEFAULT_THEME, DESIGN_THEMES, THEMES, themeStyle } from './themes.js';
export type { ThemeName, TokenName } from './themes.js';
