import { describe, expect, test } from 'vitest';
import type { Shape, ShapeId } from '@workspec/canvas';
import type { C4BoundaryShape, C4NodeShape } from './c4-types.js';
import { reflowC4Boundary } from './boundary-reflow.js';

const shapeId = (id: string): ShapeId => id as ShapeId;

function node(id: string, x: number, y: number, inBoundary: boolean): C4NodeShape {
  return {
    id: shapeId(id),
    type: 'c4node',
    index: id,
    x,
    y,
    width: 300,
    height: 110,
    slug: id,
    nodeType: inBoundary ? 'domain' : 'actor',
    label: id,
    meta: { ephemeral: true, ...(inBoundary ? { inBoundary: true } : {}) },
  };
}

function fixture(): Record<ShapeId, Shape> {
  const boundary: C4BoundaryShape = {
    id: shapeId('c4_boundary'),
    type: 'c4boundary',
    index: 'boundary',
    x: -48,
    y: -48,
    width: 796,
    height: 206,
    label: 'System',
    accent: 'blue',
    meta: { ephemeral: true },
  };
  const first = node('first', 0, 0, true);
  const second = node('second', 400, 0, true);
  const actor = node('actor', 900, 500, false);
  return {
    [boundary.id]: boundary,
    [first.id]: first,
    [second.id]: second,
    [actor.id]: actor,
  };
}

describe('reflowC4Boundary', () => {
  test('expands the system boundary when a contained node is dragged outward', () => {
    const shapes = fixture();
    const secondId = shapeId('second');
    const second = shapes[secondId];
    if (!second) throw new Error('fixture node missing');

    const moved = {
      ...shapes,
      [secondId]: { ...second, x: 600, y: 120 },
    };
    const result = reflowC4Boundary(moved);

    expect(result[shapeId('c4_boundary')]).toMatchObject({
      x: -48,
      y: -48,
      width: 996,
      height: 326,
    });
  });

  test('ignores people and external shapes outside the system', () => {
    const shapes = fixture();
    const actorId = shapeId('actor');
    const actor = shapes[actorId];
    if (!actor) throw new Error('fixture actor missing');

    const moved = {
      ...shapes,
      [actorId]: { ...actor, x: 2_000, y: 2_000 },
    };
    const result = reflowC4Boundary(moved);

    expect(result[shapeId('c4_boundary')]).toEqual(shapes[shapeId('c4_boundary')]);
  });

  test('returns the same record when the boundary already fits', () => {
    const shapes = fixture();
    expect(reflowC4Boundary(shapes)).toBe(shapes);
  });
});
