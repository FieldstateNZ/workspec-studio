// The C4Diagram facade's interaction tool (#120): registered over the
// engine's default select tool so the recomposed canvas keeps this
// package's SHIPPED interaction contract exactly (see c4-diagram.test.tsx):
//
// - click a node (no meaningful movement)  → activate (onSelect + onNavigate)
// - drag a node (editable host only)       → move + write layout, NO activate
// - click empty canvas (no movement)       → onSelect(null)
// - drag empty canvas                      → pan the camera (never marquee)
//
// The enterprise whiteboard's select tool marquees on background drag and
// selects on pointerdown; this facade's background-drag-pans /
// activate-on-click semantics are the c4-ui contract its consumers (site
// demo, c4-studio client, MF host) already rely on — a deliberate,
// documented divergence from the whiteboard tool, not from c4-ui.

import type { CanvasStoreInstance, Shape, ShapeId, Tool, Vec2 } from '@workspec/canvas';
import { hitTestTopmost } from '@workspec/canvas';

/** One node click/drag threshold in screen px — the c4-ui DRAG_THRESHOLD. */
const DRAG_THRESHOLD = 4;

export interface FacadeToolCallbacks {
  /** Whether node dragging (drag-to-pin) is permitted right now. */
  isEditable: () => boolean;
  /** A no-movement click landed on a node. */
  onActivateNode: (shapeId: ShapeId) => void;
  /** A no-movement click landed on empty canvas. */
  onBackgroundClick: () => void;
  /** A node drag completed (the move is already committed to the store). */
  onDragCommit: () => void;
}

interface GestureState {
  startScreen: Vec2 | null;
  hitId: ShapeId | null;
  origin: Vec2 | null;
  camStart: { x: number; y: number; zoom: number } | null;
  moved: boolean;
}

export function createFacadeTool(
  instance: CanvasStoreInstance,
  callbacks: FacadeToolCallbacks,
): Tool {
  const state: GestureState = {
    startScreen: null,
    hitId: null,
    origin: null,
    camStart: null,
    moved: false,
  };

  const reset = (): void => {
    state.startScreen = null;
    state.hitId = null;
    state.origin = null;
    state.camStart = null;
    state.moved = false;
  };

  return {
    name: 'select',
    cursor: 'default',

    onPointerDown: (e, store) => {
      reset();
      state.startScreen = { x: e.screenX, y: e.screenY };
      const hit = hitTestTopmost(e.pageX, e.pageY, store.shapes, store.lens, (type) =>
        instance.shapeUtils.get(type),
      );
      if (hit !== null) {
        const shape = store.shapes[hit];
        state.hitId = hit;
        state.origin = shape ? { x: shape.x, y: shape.y } : null;
      } else {
        state.camStart = { ...store.camera };
      }
    },

    onPointerMove: (e, store) => {
      if (!state.startScreen) return;
      const dx = e.screenX - state.startScreen.x;
      const dy = e.screenY - state.startScreen.y;
      if (!state.moved && Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD) state.moved = true;
      if (!state.moved) return;

      if (state.hitId !== null && state.origin) {
        // Node drag — only when the host grants drag-to-pin.
        if (!callbacks.isEditable()) return;
        const shape = store.shapes[state.hitId];
        if (!shape) return;
        store.setIsDragging(true);
        store._setShapesRaw({
          ...store.shapes,
          [state.hitId]: {
            ...shape,
            x: state.origin.x + dx / store.camera.zoom,
            y: state.origin.y + dy / store.camera.zoom,
          },
        });
        return;
      }

      if (state.camStart) {
        // Background drag = pan (the c4-ui contract; never a marquee).
        store.setCamera({
          x: state.camStart.x - dx / state.camStart.zoom,
          y: state.camStart.y - dy / state.camStart.zoom,
          zoom: state.camStart.zoom,
        });
      }
    },

    onPointerUp: (e, store) => {
      void e;
      const { hitId, origin, moved, camStart } = state;
      reset();

      if (hitId !== null) {
        if (!moved) {
          callbacks.onActivateNode(hitId);
          return;
        }
        if (!callbacks.isEditable()) return;
        // Commit the whole drag as ONE undoable command (engine convention),
        // then hand the write-back to the facade.
        const shape = store.shapes[hitId];
        if (!shape || !origin) return;
        const finalPos = { x: shape.x, y: shape.y };
        const prev: Shape = { ...shape, x: origin.x, y: origin.y };
        const next: Shape = { ...shape };
        store._executeCommand({
          label: 'Move node',
          do: (s) => ({ ...s, [hitId]: { ...(s[hitId] ?? next), ...finalPos } }),
          undo: (s) => ({ ...s, [hitId]: { ...(s[hitId] ?? prev), x: origin.x, y: origin.y } }),
        });
        store.setIsDragging(false);
        callbacks.onDragCommit();
        return;
      }

      if (camStart && !moved) {
        callbacks.onBackgroundClick();
      }
    },

    // A rapid second click synthesizes a double-click in the engine's
    // pointer pipeline (300ms/5px) INSTEAD of a second down/up pair — treat
    // it as another activation so double-clicking keeps the previous
    // facade's two-activations behaviour.
    onDoubleClick: (e, store) => {
      const hit = hitTestTopmost(e.pageX, e.pageY, store.shapes, store.lens, (type) =>
        instance.shapeUtils.get(type),
      );
      if (hit !== null) callbacks.onActivateNode(hit);
      reset();
    },

    onExit: reset,
  };
}
