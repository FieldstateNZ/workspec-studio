import { describe, expect, test } from 'vitest';
import {
  applyIndexPatch,
  computeBringForward,
  computeBringToFront,
  computeSendBackward,
  computeSendToBack,
} from './z-order.js';
import { shapeFactory } from '../test-helpers/factories.js';
import type { Shape, ShapeId } from '../types.js';

function record(shapes: Shape[]): Record<ShapeId, Shape> {
  const out: Record<ShapeId, Shape> = {};
  for (const s of shapes) out[s.id] = s;
  return out;
}

function order(shapes: Record<ShapeId, Shape>): ShapeId[] {
  return Object.values(shapes)
    .sort((a, b) => a.index.localeCompare(b.index))
    .map((s) => s.id);
}

describe('z-order computations (pure)', () => {
  test('bringToFront patch places selection above all, undo patch restores exactly', () => {
    const [a, b, c] = [shapeFactory(), shapeFactory(), shapeFactory()];
    const shapes = record([a, b, c]);
    const patch = computeBringToFront(shapes, [a.id]);

    const after = applyIndexPatch(shapes, patch.newIndices);
    expect(order(after)).toEqual([b.id, c.id, a.id]);

    const restored = applyIndexPatch(after, patch.prevIndices);
    expect(order(restored)).toEqual([a.id, b.id, c.id]);
    expect(restored[a.id]?.index).toBe(a.index);
  });

  test('sendToBack places selection below all, preserving selection order', () => {
    const [a, b, c, d] = [shapeFactory(), shapeFactory(), shapeFactory(), shapeFactory()];
    const shapes = record([a, b, c, d]);
    const patch = computeSendToBack(shapes, [c.id, d.id]);
    expect(order(applyIndexPatch(shapes, patch.newIndices))).toEqual([c.id, d.id, a.id, b.id]);
  });

  test('bringForward returns null when the selection is already frontmost or unknown', () => {
    const [a, b] = [shapeFactory(), shapeFactory()];
    const shapes = record([a, b]);
    expect(computeBringForward(shapes, [b.id])).toBeNull();
    expect(computeBringForward(shapes, ['ghost' as ShapeId])).toBeNull();
  });

  test('sendBackward returns null when the selection is already backmost', () => {
    const [a, b] = [shapeFactory(), shapeFactory()];
    const shapes = record([a, b]);
    expect(computeSendBackward(shapes, [a.id])).toBeNull();
  });

  test('bringForward hops the blocker but stays under the ceiling', () => {
    const [a, b, c] = [shapeFactory(), shapeFactory(), shapeFactory()];
    const shapes = record([a, b, c]);
    const patch = computeBringForward(shapes, [a.id]);
    expect(patch).not.toBeNull();
    if (patch) {
      expect(order(applyIndexPatch(shapes, patch.newIndices))).toEqual([b.id, a.id, c.id]);
    }
  });
});
