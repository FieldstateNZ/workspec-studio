// @workspec/canvas-c4 — C4 semantics as a layer on the @workspec/canvas
// engine (epic #116, S3 #119): the ResolvedDiagram → shape projection,
// the c4node/c4boundary shape modules with the enterprise card chrome, the
// C4CanvasHost bridge contract, and elk-position + orthogonal-router
// composition.
//
// Styles ship compiled and separate: import `@workspec/canvas-c4/styles.css`
// (alongside `@workspec/canvas/styles.css`).

// ── Model + projection ───────────────────────────────────────────────────────
export {
  buildC4Shapes,
  edgeShapeId,
  fitCamera,
  insideTypesFor,
  nodeShapeId,
  viewFor,
} from './project-model.js';
export type {
  BoundaryOpts,
  BuildC4ShapesOptions,
  C4BoundaryLevel,
  C4Lens,
  ProjectionResult,
} from './project-model.js';
export { elkC4Layout, projectC4Diagram } from './layout.js';
export type { C4LayoutFn, ProjectC4DiagramOptions } from './layout.js';

// ── Types + host contract ────────────────────────────────────────────────────
export { getC4Host } from './c4-types.js';
export type {
  C4BoundaryShape,
  C4CanvasHost,
  C4NodeMeta,
  C4NodeShape,
  C4ValidationError,
} from './c4-types.js';

// ── Shape modules ────────────────────────────────────────────────────────────
export { registerC4, buildCanvasSpec } from './register-c4.js';
export {
  C4_NODE_HEIGHT,
  C4_NODE_WIDTH,
  c4NodeShapeUtil,
} from './shapes/c4-node-shape-util.js';
export {
  C4_BOUNDARY_DEFAULT_H,
  C4_BOUNDARY_DEFAULT_W,
  C4_BOUNDARY_PAD,
  c4BoundaryShapeUtil,
} from './shapes/c4-boundary-shape-util.js';
export { C4NodeComponent } from './shapes/c4-node-component.js';
export { C4BoundaryComponent } from './shapes/c4-boundary-component.js';
export { ShapeFrame } from './shapes/shape-renderers.js';
export type { NodeShapeVariant } from './shapes/shape-renderers.js';

// ── Status slot + styling ────────────────────────────────────────────────────
export { C4NodeStatusSlot, useC4NodeStatus } from './node-status-slot.js';
export type { C4NodeStatusRenderer } from './node-status-slot.js';
export {
  DEFAULT_CONNECTION_STYLES,
  DEFAULT_ELEMENT_STYLES,
  resolveConnectionStyle,
  resolveElementStyle,
} from './style/spec-defaults.js';
export type {
  ConnectionLineStyle,
  ElementShape,
  ResolvedConnectionStyle,
  ResolvedElementStyle,
} from './style/spec-defaults.js';
export { ICON_BY_KEY, iconForKey, labelForType } from './style/icons.js';

// ── Demo fixture ─────────────────────────────────────────────────────────────
export { C4Demo, demoProjection, demoResolvedDiagram } from './c4-demo.js';
export type { C4DemoProps } from './c4-demo.js';
