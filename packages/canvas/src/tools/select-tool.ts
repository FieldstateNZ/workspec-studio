import type { Tool } from './tool-base.js';
import type { CanvasStore, CanvasStoreInstance } from '../store/store.types.js';
import type { Box, LensMode, Shape, ShapeId, Vec2 } from '../types.js';
import type { TextShape } from '../shape-types.js';
import type { ShapeUtilRegistry } from '../shape-util.js';
import { pageToScreen } from '../utils/transforms.js';
import { rotatePoint } from '../utils/geometry.js';
import { containerDescendants } from '../utils/containers.js';
import { effectivePosition, effectiveBounds, isHittableInLens } from '../utils/lens.js';
import { hitTestTopmost } from '../utils/hit-test.js';

const DRAG_THRESHOLD = 5;
const HANDLE_RADIUS = 8;
const ROTATION_HANDLE_OFFSET = 30;

type Corner = 'tl' | 'tr' | 'bl' | 'br';

interface RotateState {
  startAngle: number;
  initialRotation: number;
  shapeId: ShapeId;
  pageCx: number;
  pageCy: number;
}

interface SelectToolState {
  dragStart: Vec2 | null;
  dragShapeId: ShapeId | null;
  marqueeStart: Vec2 | null;
  hasDragged: boolean;
  resizeHandle: { corner: Corner; initialBounds: Box } | null;
  initialPositions: Map<ShapeId, Vec2>;
  initialLensOffsets: Map<ShapeId, { dx: number; dy: number } | undefined>;
  isDraggingShapes: boolean;
  rotateState: RotateState | null;
  pendingEditId: ShapeId | null;
}

function canEnterEditMode(shapeType: string, lens: LensMode): boolean {
  return !(lens === 'structured' && shapeType === 'sticky');
}

/** The sole selected shape, or null when the selection isn't exactly one. */
function soleSelected(store: CanvasStore): { id: ShapeId; shape: Shape } | null {
  const { selectedIds, shapes } = store;
  if (selectedIds.size !== 1) return null;
  const id = [...selectedIds][0];
  if (id === undefined) return null;
  const shape = shapes[id];
  if (!shape) return null;
  return { id, shape };
}

/**
 * The select tool: click/shift-click/marquee selection, shape dragging
 * (freeform x/y or structured lensOffset), corner resize, rotation handle
 * and click-to-edit — the default tool every instance registers. Ported
 * from the enterprise `SelectTool.ts`; the factory takes the canvas
 * instance (instead of the enterprise module-singleton store) for its two
 * out-of-snapshot needs: post-`select()` fresh state reads and
 * instance-scoped shape utils.
 */
export function createSelectTool(instance: CanvasStoreInstance): Tool {
  const state: SelectToolState = {
    dragStart: null,
    dragShapeId: null,
    marqueeStart: null,
    hasDragged: false,
    resizeHandle: null,
    initialPositions: new Map(),
    initialLensOffsets: new Map(),
    isDraggingShapes: false,
    rotateState: null,
    pendingEditId: null,
  };

  function reset(): void {
    state.dragStart = null;
    state.dragShapeId = null;
    state.marqueeStart = null;
    state.hasDragged = false;
    state.resizeHandle = null;
    state.initialPositions.clear();
    state.initialLensOffsets.clear();
    state.isDraggingShapes = false;
    state.rotateState = null;
    state.pendingEditId = null;
  }

  function hitTestShapes(pageX: number, pageY: number, store: CanvasStore): ShapeId | null {
    return hitTestTopmost(pageX, pageY, store.shapes, store.lens, (type) =>
      instance.shapeUtils.get(type),
    );
  }

  function checkRotationHandle(screenX: number, screenY: number, store: CanvasStore): boolean {
    const sole = soleSelected(store);
    if (!sole) return false;
    const { shape } = sole;
    const { camera, lens } = store;
    const rot = shape.rotation ?? 0;
    const effPos = effectivePosition(shape, lens);
    const screenPos = pageToScreen({ x: effPos.x, y: effPos.y }, camera);
    const screenCenter = pageToScreen(
      { x: effPos.x + shape.width / 2, y: effPos.y + shape.height / 2 },
      camera,
    );
    const w = shape.width * camera.zoom;
    const unrotatedX = screenPos.x + w / 2;
    const unrotatedY = screenPos.y - ROTATION_HANDLE_OFFSET;
    const handle = rotatePoint(unrotatedX, unrotatedY, screenCenter.x, screenCenter.y, rot);
    return Math.hypot(screenX - handle.x, screenY - handle.y) <= HANDLE_RADIUS;
  }

  function checkResizeHandle(
    screenX: number,
    screenY: number,
    store: CanvasStore,
  ): { corner: Corner; initialBounds: Box } | null {
    const sole = soleSelected(store);
    if (!sole) return null;
    const { shape } = sole;
    if (!instance.shapeUtils.get(shape.type)?.canResize(shape)) return null;
    const { camera, lens } = store;

    const rot = shape.rotation ?? 0;
    const effPos = effectivePosition(shape, lens);
    const screenPos = pageToScreen({ x: effPos.x, y: effPos.y }, camera);
    const screenCenter = pageToScreen(
      { x: effPos.x + shape.width / 2, y: effPos.y + shape.height / 2 },
      camera,
    );
    const w = shape.width * camera.zoom;
    const h = shape.height * camera.zoom;

    const corners: [Corner, Vec2][] = [
      ['tl', { x: screenPos.x, y: screenPos.y }],
      ['tr', { x: screenPos.x + w, y: screenPos.y }],
      ['bl', { x: screenPos.x, y: screenPos.y + h }],
      ['br', { x: screenPos.x + w, y: screenPos.y + h }],
    ];

    for (const [corner, pos] of corners) {
      const rotated = rotatePoint(pos.x, pos.y, screenCenter.x, screenCenter.y, rot);
      if (Math.hypot(screenX - rotated.x, screenY - rotated.y) <= HANDLE_RADIUS) {
        return {
          corner,
          initialBounds: { x: shape.x, y: shape.y, width: shape.width, height: shape.height },
        };
      }
    }
    return null;
  }

  return {
    name: 'select',
    cursor: 'default',

    onPointerDown: (e, store) => {
      reset();
      state.dragStart = { x: e.screenX, y: e.screenY };

      if (checkRotationHandle(e.screenX, e.screenY, store)) {
        const sole = soleSelected(store);
        if (sole) {
          const { id, shape } = sole;
          const { camera, lens } = store;
          const effPos = effectivePosition(shape, lens);
          const screenCenter = pageToScreen(
            { x: effPos.x + shape.width / 2, y: effPos.y + shape.height / 2 },
            camera,
          );
          const startAngle =
            (Math.atan2(e.screenY - screenCenter.y, e.screenX - screenCenter.x) * 180) / Math.PI;
          state.rotateState = {
            startAngle,
            initialRotation: shape.rotation ?? 0,
            shapeId: id,
            pageCx: effPos.x + shape.width / 2,
            pageCy: effPos.y + shape.height / 2,
          };
        }
        return;
      }

      const resizeHandle = checkResizeHandle(e.screenX, e.screenY, store);
      if (resizeHandle) {
        state.resizeHandle = resizeHandle;
        store.setIsResizing(true);
        return;
      }

      const hitId = hitTestShapes(e.pageX, e.pageY, store);
      if (hitId) {
        state.dragShapeId = hitId;
        const hitShape = store.shapes[hitId];
        // Expand to group: clicking any member selects all members. Or, for a
        // container shape, pull in its whole subtree so dragging the group
        // moves everything inside it.
        const idsToSelect: ShapeId[] = hitShape?.groupId
          ? Object.values(store.shapes)
              .filter((s) => s.groupId === hitShape.groupId)
              .map((s) => s.id)
          : [hitId, ...containerDescendants(hitId, store.shapes)];

        if (e.shiftKey) {
          store.select(idsToSelect, 'toggle');
        } else if (!store.selectedIds.has(hitId)) {
          store.select(idsToSelect, 'replace');
        } else if (!hitShape?.groupId && store.selectedIds.size === 1) {
          // Non-grouped sole selection — a clean click (no drag) should enter editing.
          const shape = store.shapes[hitId];
          if (
            shape &&
            instance.shapeUtils.get(shape.type)?.canEditText(shape) &&
            canEnterEditMode(shape.type, store.lens)
          ) {
            state.pendingEditId = hitId;
          }
        }

        // Read fresh state — store.select() above updated the store
        // synchronously, but `store` is a snapshot from before the call.
        const fresh = instance.getState();
        for (const id of fresh.selectedIds) {
          const s = fresh.shapes[id];
          if (s) {
            state.initialPositions.set(id, { x: s.x, y: s.y });
            state.initialLensOffsets.set(id, s.lensOffset);
          }
        }
        state.isDraggingShapes = false;
      } else {
        if (!e.shiftKey) store.clearSelection();
        state.marqueeStart = { x: e.pageX, y: e.pageY };
      }
    },

    onPointerMove: (e, store) => {
      if (!state.dragStart) return;

      const dx = e.screenX - state.dragStart.x;
      const dy = e.screenY - state.dragStart.y;
      const dist = Math.hypot(dx, dy);

      if (!state.hasDragged && dist < DRAG_THRESHOLD) return;
      state.hasDragged = true;

      if (state.rotateState) {
        const { rotateState } = state;
        const { camera } = store;
        const screenCenter = pageToScreen({ x: rotateState.pageCx, y: rotateState.pageCy }, camera);
        const currentAngle =
          (Math.atan2(e.screenY - screenCenter.y, e.screenX - screenCenter.x) * 180) / Math.PI;
        let newRotation = rotateState.initialRotation + (currentAngle - rotateState.startAngle);
        if (e.shiftKey) {
          newRotation = Math.round(newRotation / 15) * 15;
        }
        const { shapes } = store;
        const shape = shapes[rotateState.shapeId];
        if (shape) {
          store._setShapesRaw({
            ...shapes,
            [rotateState.shapeId]: { ...shape, rotation: newRotation },
          });
        }
        return;
      }

      if (state.resizeHandle) {
        const { corner, initialBounds } = state.resizeHandle;
        const sole = soleSelected(store);
        if (!sole) return;
        const { id, shape } = sole;
        const { shapes, camera } = store;

        const rot = shape.rotation ?? 0;
        const pageDxRaw = dx / camera.zoom;
        const pageDyRaw = dy / camera.zoom;

        // Un-rotate drag delta into shape-local frame for correct handle tracking.
        let localDx: number;
        let localDy: number;
        if (rot !== 0) {
          const rotRad = (rot * Math.PI) / 180;
          localDx = pageDxRaw * Math.cos(rotRad) + pageDyRaw * Math.sin(rotRad);
          localDy = -pageDxRaw * Math.sin(rotRad) + pageDyRaw * Math.cos(rotRad);
        } else {
          localDx = pageDxRaw;
          localDy = pageDyRaw;
        }

        let { x, y, width, height } = initialBounds;

        if (rot !== 0) {
          // Rotated shape: keep center fixed, resize in local frame.
          const cx = x + width / 2;
          const cy = y + height / 2;
          if (corner === 'tl') {
            width -= localDx;
            height -= localDy;
          } else if (corner === 'tr') {
            width += localDx;
            height -= localDy;
          } else if (corner === 'bl') {
            width -= localDx;
            height += localDy;
          } else {
            width += localDx;
            height += localDy;
          }
          width = Math.max(20, width);
          height = Math.max(20, height);
          x = cx - width / 2;
          y = cy - height / 2;
        } else {
          // Unrotated: opposite corner stays fixed.
          if (corner === 'tl') {
            x += localDx;
            y += localDy;
            width -= localDx;
            height -= localDy;
          } else if (corner === 'tr') {
            y += localDy;
            width += localDx;
            height -= localDy;
          } else if (corner === 'bl') {
            x += localDx;
            width -= localDx;
            height += localDy;
          } else {
            width += localDx;
            height += localDy;
          }
          width = Math.max(20, width);
          height = Math.max(20, height);
        }

        store._setShapesRaw({ ...shapes, [id]: { ...shape, x, y, width, height } });
        return;
      }

      if (state.dragShapeId && state.initialPositions.size > 0) {
        store.setIsDragging(true);
        state.isDraggingShapes = true;
        const { shapes, camera, lens } = store;
        const pageDx = dx / camera.zoom;
        const pageDy = dy / camera.zoom;
        const next = { ...shapes };

        if (lens === 'structured') {
          // In structured lens, dragging writes lensOffset (x/y stay unchanged).
          for (const [id, initOffset] of state.initialLensOffsets) {
            const s = shapes[id];
            if (s) {
              const base = initOffset ?? { dx: 0, dy: 0 };
              next[id] = { ...s, lensOffset: { dx: base.dx + pageDx, dy: base.dy + pageDy } };
            }
          }
        } else {
          for (const [id, initPos] of state.initialPositions) {
            const s = shapes[id];
            if (s) {
              next[id] = { ...s, x: initPos.x + pageDx, y: initPos.y + pageDy };
            }
          }
        }
        store._setShapesRaw(next);
        return;
      }

      if (state.marqueeStart) {
        store.setMarquee({
          startX: state.marqueeStart.x,
          startY: state.marqueeStart.y,
          endX: e.pageX,
          endY: e.pageY,
        });
      }
    },

    onPointerUp: (e, store) => {
      if (state.rotateState) {
        const { shapes } = store;
        const { shapeId, initialRotation } = state.rotateState;
        const shape = shapes[shapeId];
        if (shape && state.hasDragged) {
          const finalRotation = shape.rotation ?? 0;
          store._executeCommand({
            label: 'Rotate shape',
            do: (s) => {
              const target = s[shapeId];
              return target ? { ...s, [shapeId]: { ...target, rotation: finalRotation } } : s;
            },
            undo: (s) => {
              const target = s[shapeId];
              return target ? { ...s, [shapeId]: { ...target, rotation: initialRotation } } : s;
            },
          });
        }
        reset();
        return;
      }

      if (state.resizeHandle && state.hasDragged) {
        const sole = soleSelected(store);
        if (sole) {
          const { id, shape } = sole;
          const { initialBounds } = state.resizeHandle;
          const prev: Shape = { ...shape, ...initialBounds };
          // Lock whichever dimension the user explicitly resized.
          const wChanged = Math.abs(shape.width - initialBounds.width) > 1;
          const hChanged = Math.abs(shape.height - initialBounds.height) > 1;
          const current: Shape =
            shape.type === 'text'
              ? {
                  ...shape,
                  lockWidth: wChanged ? true : (shape as TextShape).lockWidth,
                  lockHeight: hChanged ? true : (shape as TextShape).lockHeight,
                }
              : shape;
          store._executeCommand({
            label: 'Resize shape',
            do: (s) => ({ ...s, [id]: current }),
            undo: (s) => ({ ...s, [id]: prev }),
          });
        }
        store.setIsResizing(false);
        reset();
        return;
      }

      if (state.isDraggingShapes && state.hasDragged && state.dragStart) {
        const { camera, lens } = store;
        const dx = (e.screenX - state.dragStart.x) / camera.zoom;
        const dy = (e.screenY - state.dragStart.y) / camera.zoom;

        if (lens === 'structured') {
          // Commit lensOffset changes for structured-lens drag.
          const ids = [...state.initialLensOffsets.keys()];
          const prevOffsets = new Map(state.initialLensOffsets);

          store._executeCommand({
            label: 'Move shapes (structured)',
            do: (s) => {
              const next = { ...s };
              for (const id of ids) {
                const shape = next[id];
                const init = prevOffsets.get(id);
                if (shape) {
                  const base = init ?? { dx: 0, dy: 0 };
                  next[id] = { ...shape, lensOffset: { dx: base.dx + dx, dy: base.dy + dy } };
                }
              }
              return next;
            },
            undo: (s) => {
              const next = { ...s };
              for (const id of ids) {
                const shape = next[id];
                if (shape) {
                  // Restore the exact original state (undefined means no offset at all).
                  next[id] = { ...shape, lensOffset: prevOffsets.get(id) };
                }
              }
              return next;
            },
          });
        } else {
          const ids = [...state.initialPositions.keys()];
          const prevPositions = new Map(state.initialPositions);

          store._executeCommand({
            label: 'Move shapes',
            do: (s) => {
              const next = { ...s };
              for (const id of ids) {
                const shape = next[id];
                const init = prevPositions.get(id);
                if (shape && init) {
                  next[id] = { ...shape, x: init.x + dx, y: init.y + dy };
                }
              }
              return next;
            },
            undo: (s) => {
              const next = { ...s };
              for (const id of ids) {
                const shape = next[id];
                const init = prevPositions.get(id);
                if (shape && init) {
                  next[id] = { ...shape, x: init.x, y: init.y };
                }
              }
              return next;
            },
          });
        }

        store.setIsDragging(false);
        reset();
        return;
      }

      if (state.marqueeStart) {
        const marquee = store.marquee;
        if (marquee) {
          const { shapes, lens } = store;
          const minX = Math.min(marquee.startX, marquee.endX);
          const maxX = Math.max(marquee.startX, marquee.endX);
          const minY = Math.min(marquee.startY, marquee.endY);
          const maxY = Math.max(marquee.startY, marquee.endY);

          const hits = Object.values(shapes)
            .filter((s) => {
              const util = instance.shapeUtils.get(s.type);
              if (!util) return false;
              if (!isHittableInLens(s, lens)) return false;
              const b = effectiveBounds(s, lens, util);
              return b.x < maxX && b.x + b.width > minX && b.y < maxY && b.y + b.height > minY;
            })
            .map((s) => s.id);

          store.select(hits, e.shiftKey ? 'add' : 'replace');
        }
        store.setMarquee(null);
        reset();
        return;
      }

      if (!state.hasDragged && state.pendingEditId) {
        store.setEditing(state.pendingEditId);
        reset();
        return;
      }

      if (!state.hasDragged && !state.dragShapeId) {
        if (!e.shiftKey) store.clearSelection();
      }

      reset();
    },

    onDoubleClick: (e, store) => {
      const hitId = hitTestShapes(e.pageX, e.pageY, store);
      if (hitId) {
        const shape = store.shapes[hitId];
        if (shape) {
          const util = instance.shapeUtils.get(shape.type);
          if (util?.canEditText(shape) && canEnterEditMode(shape.type, store.lens)) {
            store.select([hitId], 'replace');
            store.setEditing(hitId);
          }
        }
      }
    },

    onKeyDown: (e, store) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (store.editingId) return;
        const ids = [...store.selectedIds];
        if (ids.length > 0) store.deleteShapes(ids);
      }
    },
  };
}

/**
 * The resize cursor (nwse/nesw) for the corner handle under a screen
 * point, or null when the point isn't on a handle. Consumed by the
 * selection chrome (S2) to preview the resize affordance. Shape utils are
 * a parameter because they're instance-scoped.
 */
export function getResizeCursorForPoint(
  screenX: number,
  screenY: number,
  store: CanvasStore,
  shapeUtils: ShapeUtilRegistry,
): string | null {
  const { selectedIds, shapes, camera, lens } = store;
  if (selectedIds.size !== 1) return null;
  const id = [...selectedIds][0];
  if (id === undefined) return null;
  const shape = shapes[id];
  if (!shape || !shapeUtils.get(shape.type)?.canResize(shape)) return null;

  const rot = shape.rotation ?? 0;
  const effPos = effectivePosition(shape, lens);
  const screenPos = pageToScreen({ x: effPos.x, y: effPos.y }, camera);
  const screenCenter = pageToScreen(
    { x: effPos.x + shape.width / 2, y: effPos.y + shape.height / 2 },
    camera,
  );
  const w = shape.width * camera.zoom;
  const h = shape.height * camera.zoom;

  const corners: [Corner, Vec2, string][] = [
    ['tl', { x: screenPos.x, y: screenPos.y }, 'nwse-resize'],
    ['tr', { x: screenPos.x + w, y: screenPos.y }, 'nesw-resize'],
    ['bl', { x: screenPos.x, y: screenPos.y + h }, 'nesw-resize'],
    ['br', { x: screenPos.x + w, y: screenPos.y + h }, 'nwse-resize'],
  ];

  for (const [, pos, cursor] of corners) {
    const rotated = rotatePoint(pos.x, pos.y, screenCenter.x, screenCenter.y, rot);
    if (Math.hypot(screenX - rotated.x, screenY - rotated.y) <= HANDLE_RADIUS) {
      return cursor;
    }
  }
  return null;
}
