// @workspec/c4-ui — host-agnostic React components for interactive WorkSpec
// C4 diagrams (standalone lib + module-federation remote).
//
// Components receive already-loaded `@workspec/c4-model`/`@workspec/c4-layout`
// data as props — there is no repository fetch, no global, no ambient theme.
// `C4Diagram` renders one positioned diagram view; `C4Explorer` adds
// segmented level-tab navigation, per-diagram layout orchestration, and a
// click-to-select element detail rail over a whole `C4Model`.
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
export type { C4ExplorerProps, C4ExplorerSelection } from './c4-explorer.js';

// ── Standalone SVG rendering ────────────────────────────────────────────────
export { renderSvg } from './render-svg.js';
export type { RenderSvgOptions } from './render-svg.js';

// ── The C4 layer (src/c4/ — folded in from the retired @workspec/canvas-c4
// package, ADR i): C4 semantics on the @workspec/canvas engine. Exported in
// full so enterprise hosts consume the projection, shape modules, host
// bridge and layout composition from THIS package's surface. c4-studio's
// render paths keep taking `labelAwareLayerSpacing` from here, unchanged. ──

// Model + projection
export {
  buildC4Shapes,
  edgeShapeId,
  fitCamera,
  insideTypesFor,
  nodeShapeId,
  viewFor,
} from './c4/index.js';
export type {
  BoundaryOpts,
  BuildC4ShapesOptions,
  C4BoundaryLevel,
  C4Lens,
  NodePlacement,
  ProjectionResult,
} from './c4/index.js';
export { elkC4Layout, labelAwareLayerSpacing, projectC4Diagram } from './c4/index.js';
export type { C4LayoutFn, ProjectC4DiagramOptions } from './c4/index.js';

// Types + host contract
export { getC4Host } from './c4/index.js';
export type {
  C4BoundaryShape,
  C4CanvasHost,
  C4NodeMeta,
  C4NodeShape,
  C4ValidationError,
} from './c4/index.js';

// Shape modules
export { registerC4, buildCanvasSpec } from './c4/index.js';
export {
  C4_NODE_HEIGHT,
  C4_NODE_WIDTH,
  c4NodeShapeUtil,
  C4_BOUNDARY_DEFAULT_H,
  C4_BOUNDARY_DEFAULT_W,
  C4_BOUNDARY_PAD,
  c4BoundaryShapeUtil,
  C4NodeComponent,
  C4BoundaryComponent,
  ShapeFrame,
} from './c4/index.js';
export type { NodeShapeVariant } from './c4/index.js';

// Status slot + C4 icon/label maps
export { C4NodeStatusSlot, useC4NodeStatus } from './c4/index.js';
export type { C4NodeStatusRenderer } from './c4/index.js';
export { ICON_BY_KEY, iconForKey, labelForType } from './c4/index.js';

// Demo fixture
export { C4Demo, demoProjection, demoResolvedDiagram } from './c4/index.js';
export type { C4DemoProps } from './c4/index.js';

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
