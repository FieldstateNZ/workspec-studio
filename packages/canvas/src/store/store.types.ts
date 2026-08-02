import type { StoreApi } from 'zustand/vanilla';
import type { Camera, Command, HistoryStack, LensMode, MarqueeState, Shape, ShapeId, ToolName } from '../types.js';
import type { CanvasHost } from '../canvas-host.js';
import type { KindResolver } from '../kind-resolver.js';
import type { ShapeUtilRegistry } from '../shape-util.js';
import type { CanvasHoverState } from './hover.js';
import type { CanvasSnapshot } from './snapshot.js';
import type { ToolRegistry } from './tool-registry.js';

/**
 * The canvas view + document state. Ported field-for-field from the
 * enterprise store (issue #117) minus the prototype-builder screen
 * element sub-selection, which stays enterprise with the screen shape
 * family.
 */
export interface CanvasState {
  camera: Camera;
  shapes: Record<ShapeId, Shape>;
  selectedIds: Set<ShapeId>;
  hoveredId: ShapeId | null;
  editingId: ShapeId | null;
  activeTool: ToolName;
  /** The node kind the 'place' tool drops on click. Only read while
   *  activeTool === 'place'; set when the user picks a palette type. */
  placementNodeType: string | null;
  history: HistoryStack;
  marquee: MarqueeState | null;
  isDragging: boolean;
  isResizing: boolean;
  // ── Host-driven overlay state ──
  // Hosts drive these via store actions (agent tool actions, ingestion
  // stream, view filters); the render layer reads them. None persist.
  /** Focus mode: non-members dim and the host shows a "Back to map" affordance. */
  focusIds: Set<ShapeId> | null;
  /** Timed pulse rings (highlight action). */
  highlightIds: Set<ShapeId>;
  /** Entrance animation for shapes that arrived live (not baseline load). */
  recentIds: Set<ShapeId>;
  /**
   * Per-kind visibility filter, matched against the instance's
   * `kindResolver` by ShapeLayer / ConnectorLayer / Minimap (live since
   * S2, #118) to skip rendering hidden kinds.
   */
  hiddenKinds: Set<string>;
  /** Last viewport intent: re-apply fit as the node set changes, leave a
   *  user-panned camera alone. Hosts flip to 'custom' on user gestures. */
  viewportIntent: 'fit' | 'reset' | 'custom';
  // View-only state — NOT in the snapshot, NOT synced by host transports.
  lens: LensMode;
  /** True for 280ms after a lens switch so the shape layer can gate the glide transition. */
  isLensSwitching: boolean;
}

/**
 * Every store mutation. Shape edits are undoable commands; `_setShapesRaw`
 * and `_executeCommand` are the documented escape hatches for live drags
 * (raw writes during the gesture, ONE command on commit) and host
 * projections.
 */
export interface CanvasActions {
  createShape: (shape: Shape) => void;
  updateShape: (id: ShapeId, patch: Partial<Shape>) => void;
  /** Consults `instance.host.deleteShapes` first — see the CanvasHost fallback contract. */
  deleteShapes: (ids: ShapeId[]) => void;
  moveShapes: (ids: ShapeId[], dx: number, dy: number) => void;
  resizeShape: (
    id: ShapeId,
    newBounds: { x: number; y: number; width: number; height: number },
  ) => void;
  alignDistribute: (ids: ShapeId[]) => void;
  setCamera: (camera: Camera) => void;
  setActiveTool: (tool: ToolName) => void;
  setPlacementNodeType: (nodeType: string | null) => void;
  select: (ids: ShapeId[], mode?: 'replace' | 'toggle' | 'add') => void;
  clearSelection: () => void;
  setHovered: (id: ShapeId | null) => void;
  setEditing: (id: ShapeId | null) => void;
  setMarquee: (marquee: MarqueeState | null) => void;
  setIsDragging: (v: boolean) => void;
  setIsResizing: (v: boolean) => void;
  setFocus: (ids: ShapeId[] | null) => void;
  /** Pulse-ring highlight; auto-clears after durationMs (default 5s). */
  highlight: (ids: ShapeId[], durationMs?: number) => void;
  /** Entrance animation for live arrivals; auto-clears after durationMs. */
  markRecent: (ids: ShapeId[], durationMs?: number) => void;
  setHiddenKinds: (kinds: Set<string>) => void;
  setViewportIntent: (intent: 'fit' | 'reset' | 'custom') => void;
  bringToFront: (ids: ShapeId[]) => void;
  sendToBack: (ids: ShapeId[]) => void;
  bringForward: (ids: ShapeId[]) => void;
  sendBackward: (ids: ShapeId[]) => void;
  groupShapes: (ids: ShapeId[]) => void;
  ungroupShapes: (ids: ShapeId[]) => void;
  undo: () => void;
  redo: () => void;
  /**
   * Replace the whole shape record WITHOUT touching history — the live-drag
   * write path, and the entry point host projections use to mint ephemeral
   * shapes. Public API (documented in the README).
   */
  _setShapesRaw: (shapes: Record<ShapeId, Shape>) => void;
  /** Execute an arbitrary pre-built command undoably (gesture commits, host edits). */
  _executeCommand: (cmd: Command) => void;
  /** Replace the document from a snapshot, resetting history + selection. */
  loadSnapshot: (snap: CanvasSnapshot) => void;
  /** Serialise camera + shapes, EXCLUDING `meta.ephemeral` shapes — see the README contract. */
  exportSnapshot: () => CanvasSnapshot;
  setLens: (lens: LensMode) => void;
}

/** The complete store surface a `useCanvasStore(selector)` selector sees. */
export type CanvasStore = CanvasState & CanvasActions;

/** Construction options for `createCanvasStore`. */
export interface CanvasStoreOptions {
  /**
   * localStorage key for browser-local persistence (debounced 800ms,
   * validated on load). OMITTED = persistence off — the package default,
   * per issue #117; hosts with their own transport leave this unset. The
   * enterprise's fixed 'workspec-canvas-v1' key becomes this option on
   * re-adoption.
   */
  persistenceKey?: string;
  /** Initial host callbacks; also settable later via `instance.host`. */
  host?: CanvasHost;
  /**
   * Kind taxonomy used with `hiddenKinds` filtering and kind-coloured
   * chrome (Minimap); defaults to shape `type`.
   */
  kindResolver?: KindResolver;
}

/**
 * One canvas = one instance: the vanilla zustand store plus everything
 * that was module-level in the enterprise source (tool registry, shape
 * utils, hover store, host bridge, timers — issue #117). Pass it to
 * `<CanvasProvider store={instance}>`; call `dispose()` when the canvas
 * is torn down for good (clears timers + the persistence subscription).
 */
export interface CanvasStoreInstance extends StoreApi<CanvasStore> {
  readonly tools: ToolRegistry;
  readonly shapeUtils: ShapeUtilRegistry;
  readonly hover: StoreApi<CanvasHoverState>;
  /** The host persistence seam — reassign to install/clear callbacks. */
  host: CanvasHost;
  /** Kind taxonomy for `hiddenKinds` filtering + Minimap colouring (ShapeLayer/ConnectorLayer/Minimap). */
  readonly kindResolver: KindResolver;
  dispose: () => void;
}
