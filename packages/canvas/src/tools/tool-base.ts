import type { ToolName } from '../types.js';
import type { CanvasStore } from '../store/store.types.js';

/**
 * A pointer event translated into canvas coordinates: `page*` is
 * world-space (camera-independent), `screen*` is canvas-relative pixels.
 * The raw `originalEvent` rides along for capabilities the translation
 * drops (pressure, capture).
 */
export interface CanvasPointerEvent {
  pageX: number;
  pageY: number;
  screenX: number;
  screenY: number;
  buttons: number;
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  pointerId: number;
  originalEvent: PointerEvent;
}

/**
 * The tool plugin contract. Tools are plain objects registered on the
 * instance's tool registry (`CanvasStoreInstance.tools`) and dispatched
 * by `usePointerEvents` keyed on `store.activeTool`. Handlers receive a
 * state SNAPSHOT taken at event time — action calls on it mutate the
 * store synchronously; tools needing a post-action re-read close over the
 * instance via their factory (see `createSelectTool`).
 */
export interface Tool {
  name: ToolName;
  cursor: string;
  onPointerDown?: (e: CanvasPointerEvent, store: CanvasStore) => void;
  onPointerMove?: (e: CanvasPointerEvent, store: CanvasStore) => void;
  onPointerUp?: (e: CanvasPointerEvent, store: CanvasStore) => void;
  onDoubleClick?: (e: CanvasPointerEvent, store: CanvasStore) => void;
  onKeyDown?: (e: KeyboardEvent, store: CanvasStore) => void;
  /** Fired when the tool becomes active (tool-switch lifecycle). */
  onEnter?: (store: CanvasStore) => void;
  /** Fired when the tool is switched away — tear down transient state here. */
  onExit?: (store: CanvasStore) => void;
}
