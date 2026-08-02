import { describe, expect, test } from 'vitest';
import { containerDescendants, withDescendants } from './containers.js';
import { shapeFactory } from '../test-helpers/factories.js';
import type { Shape, ShapeId } from '../types.js';

function record(shapes: Shape[]): Record<ShapeId, Shape> {
  const out: Record<ShapeId, Shape> = {};
  for (const s of shapes) out[s.id] = s;
  return out;
}

describe('containment tree', () => {
  test('containerDescendants walks the whole subtree, excluding the root itself', () => {
    const frame = shapeFactory();
    const child = shapeFactory({ containerId: frame.id });
    const grandchild = shapeFactory({ containerId: child.id });
    const stranger = shapeFactory();
    const shapes = record([frame, child, grandchild, stranger]);

    const descendants = containerDescendants(frame.id, shapes);
    expect(descendants).toEqual(new Set([child.id, grandchild.id]));
    expect(containerDescendants(stranger.id, shapes).size).toBe(0);
  });

  test('withDescendants expands ids without duplicating independently-selected children', () => {
    const frame = shapeFactory();
    const child = shapeFactory({ containerId: frame.id });
    const grandchild = shapeFactory({ containerId: child.id });
    const shapes = record([frame, child, grandchild]);

    const expanded = withDescendants(shapes, [frame.id, child.id]);
    expect([...expanded].sort()).toEqual([frame.id, child.id, grandchild.id].sort());
    expect(expanded).toHaveLength(3);
  });

  test('withDescendants is inert on flat canvases', () => {
    const a = shapeFactory();
    const b = shapeFactory();
    expect(withDescendants(record([a, b]), [a.id])).toEqual([a.id]);
  });
});
