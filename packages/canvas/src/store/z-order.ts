import type { Shape, ShapeId } from '../types.js';
import { generateKeyBetween } from '../utils/fractional-index.js';

/**
 * The before/after fractional-index maps for one z-order operation. The
 * store turns a patch into one undoable command (`newIndices` = do,
 * `prevIndices` = undo). Pure computation lives here so the four reorder
 * operations are unit-testable without a store.
 */
export interface ZOrderPatch {
  prevIndices: Record<string, string>;
  newIndices: Record<string, string>;
}

/** Apply an index map immutably — shared by the do/undo sides of every z-order command. */
export function applyIndexPatch(
  shapes: Record<ShapeId, Shape>,
  indices: Record<string, string>,
): Record<ShapeId, Shape> {
  const next = { ...shapes };
  for (const [id, idx] of Object.entries(indices)) {
    const shape = next[id as ShapeId];
    if (shape) next[id as ShapeId] = { ...shape, index: idx };
  }
  return next;
}

function sortedByIndex(shapes: Record<ShapeId, Shape>): Shape[] {
  return Object.values(shapes).sort((a, b) => a.index.localeCompare(b.index));
}

function capturePrevIndices(shapes: Record<ShapeId, Shape>, ids: ShapeId[]): Record<string, string> {
  const prevIndices: Record<string, string> = {};
  for (const id of ids) {
    const shape = shapes[id];
    if (shape) prevIndices[id] = shape.index;
  }
  return prevIndices;
}

/** New keys placing the selection (in its current relative order) above every other shape. */
export function computeBringToFront(shapes: Record<ShapeId, Shape>, ids: ShapeId[]): ZOrderPatch {
  const selectedSet = new Set(ids);
  const sorted = sortedByIndex(shapes);
  const nonSelected = sorted.filter((s) => !selectedSet.has(s.id));
  const selectedSorted = sorted.filter((s) => selectedSet.has(s.id));
  const newIndices: Record<string, string> = {};
  let prev: string | null = nonSelected.at(-1)?.index ?? null;
  for (const shape of selectedSorted) {
    const key = generateKeyBetween(prev, null);
    newIndices[shape.id] = key;
    prev = key;
  }
  return { prevIndices: capturePrevIndices(shapes, ids), newIndices };
}

/** New keys placing the selection (in its current relative order) below every other shape. */
export function computeSendToBack(shapes: Record<ShapeId, Shape>, ids: ShapeId[]): ZOrderPatch {
  const selectedSet = new Set(ids);
  const sorted = sortedByIndex(shapes);
  const nonSelected = sorted.filter((s) => !selectedSet.has(s.id));
  const selectedSorted = sorted.filter((s) => selectedSet.has(s.id));
  const newIndices: Record<string, string> = {};
  let next: string | null = nonSelected.at(0)?.index ?? null;
  for (const shape of [...selectedSorted].reverse()) {
    const key = generateKeyBetween(null, next);
    newIndices[shape.id] = key;
    next = key;
  }
  return { prevIndices: capturePrevIndices(shapes, ids), newIndices };
}

/**
 * New keys hopping the selection over the first non-selected shape above
 * it (the "blocker"), staying below the next one (the "ceiling"). Null
 * when the selection is already frontmost (nothing to hop).
 */
export function computeBringForward(
  shapes: Record<ShapeId, Shape>,
  ids: ShapeId[],
): ZOrderPatch | null {
  const selectedSet = new Set(ids);
  const sorted = sortedByIndex(shapes);
  // Find position of topmost selected shape.
  let topPos = -1;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const shape = sorted[i];
    if (shape && selectedSet.has(shape.id)) {
      topPos = i;
      break;
    }
  }
  if (topPos === -1) return null;
  // Find first non-selected above it (blocker).
  let blockerPos = -1;
  for (let i = topPos + 1; i < sorted.length; i++) {
    const shape = sorted[i];
    if (shape && !selectedSet.has(shape.id)) {
      blockerPos = i;
      break;
    }
  }
  if (blockerPos === -1) return null;
  // Find next non-selected above blocker (ceiling).
  let ceilingPos = -1;
  for (let i = blockerPos + 1; i < sorted.length; i++) {
    const shape = sorted[i];
    if (shape && !selectedSet.has(shape.id)) {
      ceilingPos = i;
      break;
    }
  }
  const blocker = sorted[blockerPos];
  if (!blocker) return null;
  const ceiling = ceilingPos !== -1 ? sorted[ceilingPos] : null;
  const selectedSorted = sorted.filter((s) => selectedSet.has(s.id));
  const newIndices: Record<string, string> = {};
  let prev: string = blocker.index;
  for (const shape of selectedSorted) {
    const key = generateKeyBetween(prev, ceiling?.index ?? null);
    newIndices[shape.id] = key;
    prev = key;
  }
  return { prevIndices: capturePrevIndices(shapes, ids), newIndices };
}

/**
 * New keys hopping the selection under the first non-selected shape below
 * it (the "blocker"), staying above the next one (the "floor"). Null when
 * the selection is already backmost.
 */
export function computeSendBackward(
  shapes: Record<ShapeId, Shape>,
  ids: ShapeId[],
): ZOrderPatch | null {
  const selectedSet = new Set(ids);
  const sorted = sortedByIndex(shapes);
  // Find position of bottommost selected shape.
  let bottomPos = sorted.length;
  for (let i = 0; i < sorted.length; i++) {
    const shape = sorted[i];
    if (shape && selectedSet.has(shape.id)) {
      bottomPos = i;
      break;
    }
  }
  if (bottomPos === sorted.length) return null;
  // Find first non-selected below it (blocker).
  let blockerPos = -1;
  for (let i = bottomPos - 1; i >= 0; i--) {
    const shape = sorted[i];
    if (shape && !selectedSet.has(shape.id)) {
      blockerPos = i;
      break;
    }
  }
  if (blockerPos === -1) return null;
  // Find next non-selected below blocker (floor).
  let floorPos = -1;
  for (let i = blockerPos - 1; i >= 0; i--) {
    const shape = sorted[i];
    if (shape && !selectedSet.has(shape.id)) {
      floorPos = i;
      break;
    }
  }
  const blocker = sorted[blockerPos];
  if (!blocker) return null;
  const floor = floorPos !== -1 ? sorted[floorPos] : null;
  const selectedSorted = sorted.filter((s) => selectedSet.has(s.id));
  const newIndices: Record<string, string> = {};
  let next: string = blocker.index;
  for (const shape of [...selectedSorted].reverse()) {
    const key = generateKeyBetween(floor?.index ?? null, next);
    newIndices[shape.id] = key;
    next = key;
  }
  return { prevIndices: capturePrevIndices(shapes, ids), newIndices };
}
