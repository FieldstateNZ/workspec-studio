// @workspec/canvas — host-agnostic infinite-canvas engine, ported from
// the WorkSpec enterprise canvas (epic #116: S1 engine core #117, S2
// shapes/tools/chrome #118). C4 semantics layer on via @workspec/canvas-c4
// (S3).
//
// Styles ship compiled and separate: import `@workspec/canvas/styles.css`.

// ── Core model types ─────────────────────────────────────────────────────────
export type {
  BaseShape,
  Box,
  Camera,
  Command,
  HistoryStack,
  LensMode,
  MarqueeState,
  Shape,
  ShapeId,
  ToolName,
  Vec2,
} from './types.js';
export type {
  ConnectorShape,
  DrawShape,
  EdgeCategory,
  EdgeLens,
  ImageShape,
  StickyAudio,
  StickyAuthor,
  StickyChecklistItem,
  StickyColor,
  StickyImage,
  StickyMedia,
  StickyNoteType,
  StickyReaction,
  StickyShape,
  StickyTag,
  TextShape,
} from './shape-types.js';

// ── Store factory + provider ─────────────────────────────────────────────────
export { createCanvasStore } from './store/store.js';
export type {
  CanvasActions,
  CanvasState,
  CanvasStore,
  CanvasStoreInstance,
  CanvasStoreOptions,
} from './store/store.types.js';
export type { CanvasSnapshot } from './store/snapshot.js';
export { CanvasProvider, useCanvasHover, useCanvasInstance, useCanvasStore } from './canvas-provider.js';
export type { CanvasProviderProps } from './canvas-provider.js';
export type { CanvasHoverState } from './store/hover.js';

// ── Extension seams ──────────────────────────────────────────────────────────
export type { CanvasHost } from './canvas-host.js';
export { createShapeUtilRegistry } from './shape-util.js';
export type { ShapeModule, ShapeUtil, ShapeUtilRegistry } from './shape-util.js';
export { createToolRegistry } from './store/tool-registry.js';
export type { ToolRegistry } from './store/tool-registry.js';
export type { CanvasPointerEvent, Tool } from './tools/tool-base.js';
export { defaultKindResolver } from './kind-resolver.js';
export type { KindResolver } from './kind-resolver.js';
export { registerWhiteboard } from './register-whiteboard.js';

// ── Components + contexts ────────────────────────────────────────────────────
export { Canvas } from './canvas.js';
export type { CanvasContextMenuState, CanvasProps } from './canvas.js';
export { CanvasSpecContext, EMPTY_CANVAS_SPEC, useCanvasSpec } from './canvas-spec-context.js';
export type { CanvasSpec, ConnectionStyle, ElementStyle } from './canvas-spec-context.js';
export { CanvasViewportContext, useCanvasViewport } from './canvas-viewport.js';
export type { CanvasViewport } from './canvas-viewport.js';
export { Shape as ShapeView } from './components/shape.js';
export { ShapeLayer } from './components/shape-layer.js';
export { SelectionLayer } from './components/selection-layer.js';
export { Background } from './components/background.js';
export type { BackgroundVariant } from './components/background.js';
export { MarqueeBox } from './components/marquee-box.js';
export { CanvasZoomControls } from './components/canvas-zoom-controls.js';
export { Minimap } from './components/minimap.js';
export type { MinimapProps } from './components/minimap.js';
export { ContextMenu } from './components/context-menu.js';
export { Toolbar } from './components/toolbar.js';
export type { ToolbarProps } from './components/toolbar.js';
export { Kbd, Tooltip } from './components/tooltip.js';
export { ConnectorLayer } from './shapes/connector/connector-layer.js';
export { WhiteboardDemo, seedWhiteboardDemoShapes } from './whiteboard-demo.js';

// ── Shape modules ────────────────────────────────────────────────────────────
export { stickyShapeUtil } from './shapes/sticky/sticky-shape-util.js';
export { textShapeUtil } from './shapes/text/text-shape-util.js';
export { drawShapeUtil } from './shapes/draw/draw-shape-util.js';
export { imageShapeUtil } from './shapes/image/image-shape-util.js';
export { createConnectorShapeUtil } from './shapes/connector/connector-shape-util.js';
export {
  connectorAABB,
  connectorGeometry,
  isDiscoveryConnector,
  resolveConnectorGeometry,
  routingOptsFromUtils,
  straightConnectorGeometry,
} from './shapes/connector/geometry.js';
export type { ConnectorGeometry, ConnectorRoutingOpts } from './shapes/connector/geometry.js';

// ── Hooks ────────────────────────────────────────────────────────────────────
export { computeFitCamera, useCamera } from './hooks/use-camera.js';
export { usePointerEvents } from './hooks/use-pointer-events.js';
export type { PointerEventOpts } from './hooks/use-pointer-events.js';
export { useKeyboardShortcuts } from './hooks/use-keyboard-shortcuts.js';
export type { KeyboardShortcutOptions, ShortcutScope } from './hooks/use-keyboard-shortcuts.js';
export { useTextEditing } from './hooks/use-text-editing.js';
export { compressImageFile, useImageInput } from './hooks/use-image-input.js';

// ── Tools ────────────────────────────────────────────────────────────────────
export { createSelectTool, getResizeCursorForPoint } from './tools/select-tool.js';
export { createHandTool } from './tools/hand-tool.js';
export { createDrawTool } from './tools/draw-tool.js';
export { createTextTool } from './tools/text-tool.js';
export { createStickyTool } from './tools/sticky-tool.js';
export { createConnectorTool } from './tools/connector-tool.js';
export { createPlaceTool } from './tools/place-tool.js';

// ── Utils ────────────────────────────────────────────────────────────────────
export { pageToScreen, screenToPage } from './utils/transforms.js';
export {
  distanceToSegment,
  hitTestPointInRect,
  hitTestPointToPolyline,
  rectsIntersect,
  rotatePoint,
} from './utils/geometry.js';
export { hitTestTopmost } from './utils/hit-test.js';
export { createHistory, executeCommand, redoCommand, undoCommand } from './utils/history.js';
export { computeAlignDistribute } from './utils/align-distribute.js';
export {
  generateInitialKey,
  generateKeyAfter,
  generateKeyBefore,
  generateKeyBetween,
} from './utils/fractional-index.js';
export { createShapeId } from './utils/ids.js';
export { effectiveBounds, effectivePosition, isHittableInLens } from './utils/lens.js';
export { getStickyDefaults, setStickyDefaults } from './utils/sticky-defaults.js';
export type { StickyDefaults } from './utils/sticky-defaults.js';
export { containerDescendants, withDescendants } from './utils/containers.js';
