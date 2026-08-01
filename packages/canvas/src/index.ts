// @workspec/canvas — host-agnostic infinite-canvas engine, ported from
// the WorkSpec enterprise canvas (epic #116; this is the S1 engine-core
// surface, #117). Shapes, tools beyond select, and chrome components
// arrive in S2; C4 semantics layer on via @workspec/canvas-c4 (S3).
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
export type { ShapeUtil, ShapeUtilRegistry } from './shape-util.js';
export { createToolRegistry } from './store/tool-registry.js';
export type { ToolRegistry } from './store/tool-registry.js';
export type { CanvasPointerEvent, Tool } from './tools/tool-base.js';
export { defaultKindResolver } from './kind-resolver.js';
export type { KindResolver } from './kind-resolver.js';

// ── Components + contexts ────────────────────────────────────────────────────
export { Canvas } from './canvas.js';
export type { CanvasContextMenuState, CanvasProps } from './canvas.js';
export { CanvasSpecContext, EMPTY_CANVAS_SPEC, useCanvasSpec } from './canvas-spec-context.js';
export type { CanvasSpec, ConnectionStyle, ElementStyle } from './canvas-spec-context.js';
export { CanvasViewportContext, useCanvasViewport } from './canvas-viewport.js';
export type { CanvasViewport } from './canvas-viewport.js';

// ── Hooks ────────────────────────────────────────────────────────────────────
export { computeFitCamera, useCamera } from './hooks/use-camera.js';
export { usePointerEvents } from './hooks/use-pointer-events.js';
export type { PointerEventOpts } from './hooks/use-pointer-events.js';
export { useKeyboardShortcuts } from './hooks/use-keyboard-shortcuts.js';
export { useTextEditing } from './hooks/use-text-editing.js';
export { compressImageFile, useImageInput } from './hooks/use-image-input.js';

// ── Tools ────────────────────────────────────────────────────────────────────
export { createSelectTool, getResizeCursorForPoint } from './tools/select-tool.js';

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
