import type { Tool } from './tool-base.js';
import type { CanvasStore } from '../store/store.types.js';
import type { DrawShape } from '../shape-types.js';
import type { Shape, ShapeId, Vec2 } from '../types.js';
import { createShapeId } from '../utils/ids.js';
import { generateInitialKey, generateKeyAfter } from '../utils/fractional-index.js';
import { simplify } from '../shapes/draw/simplify.js';
import { DRAW_DEFAULT_STROKE } from '../style/shape-defaults.js';

function getMaxIndex(store: CanvasStore): string | null {
  const keys = Object.values(store.shapes).map((s) => s.index);
  if (keys.length === 0) return null;
  return keys.sort().at(-1) ?? null;
}

function computeBoundsFromPoints(points: Vec2[]): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const first = points[0];
  if (first === undefined) return { x: 0, y: 0, width: 1, height: 1 };
  let minX = first.x;
  let minY = first.y;
  let maxX = first.x;
  let maxY = first.y;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
}

function omitShape(shapes: Record<ShapeId, Shape>, id: ShapeId): Record<ShapeId, Shape> {
  const next: Record<ShapeId, Shape> = {};
  for (const [key, value] of Object.entries(shapes)) {
    if (key !== id) next[key as ShapeId] = value;
  }
  return next;
}

interface DrawToolState {
  currentShapeId: ShapeId | null;
  currentPoints: Vec2[];
  startPagePos: Vec2 | null;
}

/**
 * Freehand pen: raw points stream in live via `_setShapesRaw`, the stroke
 * is RDP-simplified on pointer-up and committed as ONE undoable command.
 * Ported verbatim from the enterprise DrawTool.
 */
export function createDrawTool(): Tool {
  const state: DrawToolState = {
    currentShapeId: null,
    currentPoints: [],
    startPagePos: null,
  };

  function reset(): void {
    state.currentShapeId = null;
    state.currentPoints = [];
    state.startPagePos = null;
  }

  return {
    name: 'draw',
    cursor: 'crosshair',

    onPointerDown: (e, store) => {
      const id = createShapeId();
      const maxKey = getMaxIndex(store);
      const index = maxKey !== null ? generateKeyAfter(maxKey) : generateInitialKey();
      const point: Vec2 = { x: e.pageX, y: e.pageY };

      state.currentShapeId = id;
      state.currentPoints = [point];
      state.startPagePos = point;

      const shape: DrawShape = {
        id,
        type: 'draw',
        x: point.x,
        y: point.y,
        width: 1,
        height: 1,
        index,
        points: [{ x: 0, y: 0 }],
        strokeWidth: 2,
        color: DRAW_DEFAULT_STROKE,
      };

      const { shapes } = store;
      store._setShapesRaw({ ...shapes, [id]: shape });
    },

    onPointerMove: (e, store) => {
      if (!state.currentShapeId || !state.startPagePos) return;

      state.currentPoints.push({ x: e.pageX, y: e.pageY });

      const bounds = computeBoundsFromPoints(state.currentPoints);
      const localPoints = state.currentPoints.map((p) => ({
        x: p.x - bounds.x,
        y: p.y - bounds.y,
      }));

      const { shapes } = store;
      const existing = shapes[state.currentShapeId];
      if (!existing) return;

      const updated: Shape = {
        ...existing,
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        points: localPoints,
      };
      store._setShapesRaw({ ...shapes, [state.currentShapeId]: updated });
    },

    onPointerUp: (_e, store) => {
      if (!state.currentShapeId) return;

      const simplified = simplify(state.currentPoints, 1.0);
      const bounds = computeBoundsFromPoints(simplified);
      const localPoints = simplified.map((p) => ({
        x: p.x - bounds.x,
        y: p.y - bounds.y,
      }));

      const { shapes } = store;
      const existing = shapes[state.currentShapeId];
      if (!existing) {
        reset();
        return;
      }

      const finalShape: Shape = {
        ...existing,
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        points: localPoints,
      };

      const id = state.currentShapeId;
      store._executeCommand({
        label: 'Draw',
        do: (s) => ({ ...s, [id]: finalShape }),
        undo: (s) => omitShape(s, id),
      });
      store._setShapesRaw({ ...store.shapes, [id]: finalShape });

      reset();
    },

    onExit: reset,
  };
}
