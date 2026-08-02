import { describe, expect, test } from 'vitest';
import { hitTestTopmost } from './hit-test.js';
import type { ShapeUtil } from '../shape-util.js';
import { boxShapeUtilFactory, shapeFactory } from '../test-helpers/factories.js';
import type { Shape, ShapeId } from '../types.js';

// This consolidation replaced three enterprise loops (Canvas context menu,
// hover tracking, select tool) — the front-to-back ordering is load-bearing
// for selection, so it gets pinned here with genuinely overlapping shapes.

function record(shapes: Shape[]): Record<ShapeId, Shape> {
  const out: Record<ShapeId, Shape> = {};
  for (const s of shapes) out[s.id] = s;
  return out;
}

function utilMap(...utils: ShapeUtil[]): (type: string) => ShapeUtil | undefined {
  const map = new Map(utils.map((u) => [u.type, u]));
  return (type) => map.get(type);
}

describe('hitTestTopmost — z-ordering over overlapping shapes', () => {
  test('returns the TOPMOST (highest fractional index) of two overlapping shapes', () => {
    // shapeFactory mints strictly increasing indexes: `top` is above `bottom`.
    const bottom = shapeFactory({ x: 0, y: 0, width: 100, height: 60 });
    const top = shapeFactory({ x: 0, y: 0, width: 100, height: 60 });
    const getUtil = utilMap(boxShapeUtilFactory());

    expect(hitTestTopmost(50, 30, record([bottom, top]), 'freeform', getUtil)).toBe(top.id);

    // Swap the z-order (indexes) and the SAME point must now hit the other
    // shape — this is the assertion a topmost↔bottommost mutation flips.
    const swapped = record([
      { ...bottom, index: top.index },
      { ...top, index: bottom.index },
    ]);
    expect(hitTestTopmost(50, 30, swapped, 'freeform', getUtil)).toBe(bottom.id);
  });

  test('three-deep stack: hits strictly front-to-back', () => {
    const back = shapeFactory({ x: 0, y: 0, width: 300, height: 300 });
    const middle = shapeFactory({ x: 50, y: 50, width: 200, height: 200 });
    const front = shapeFactory({ x: 100, y: 100, width: 100, height: 100 });
    const shapes = record([back, middle, front]);
    const getUtil = utilMap(boxShapeUtilFactory());

    expect(hitTestTopmost(150, 150, shapes, 'freeform', getUtil)).toBe(front.id);
    expect(hitTestTopmost(75, 75, shapes, 'freeform', getUtil)).toBe(middle.id);
    expect(hitTestTopmost(25, 25, shapes, 'freeform', getUtil)).toBe(back.id);
    expect(hitTestTopmost(400, 400, shapes, 'freeform', getUtil)).toBeNull();
  });

  test('falls through a pointer-through topmost shape to the one beneath', () => {
    const beneath = shapeFactory({ x: 0, y: 0, width: 100, height: 60 });
    const ghostOnTop = shapeFactory({ type: 'ghost', x: 0, y: 0, width: 100, height: 60 });
    const getUtil = utilMap(
      boxShapeUtilFactory(),
      boxShapeUtilFactory({ type: 'ghost', hitTest: () => false }),
    );
    expect(hitTestTopmost(50, 30, record([beneath, ghostOnTop]), 'freeform', getUtil)).toBe(
      beneath.id,
    );
  });

  test('skips shapes whose type has no registered util', () => {
    const beneath = shapeFactory({ x: 0, y: 0, width: 100, height: 60 });
    const unregisteredOnTop = shapeFactory({ type: 'mystery', x: 0, y: 0, width: 100, height: 60 });
    const getUtil = utilMap(boxShapeUtilFactory());
    expect(
      hitTestTopmost(50, 30, record([beneath, unregisteredOnTop]), 'freeform', getUtil),
    ).toBe(beneath.id);
  });
});

describe('hitTestTopmost — rotation and lens', () => {
  test('rotation-aware: hits inside the ROTATED footprint, not the stored AABB', () => {
    const rotated = shapeFactory({ x: 0, y: 0, width: 100, height: 60, rotation: 90 });
    const shapes = record([rotated]);
    const getUtil = utilMap(boxShapeUtilFactory());

    // (25, 70) is OUTSIDE the unrotated 100x60 rect (y > 60) but inside
    // the 90°-rotated footprint; (95, 5) is inside the stored AABB but
    // outside the rotated footprint.
    expect(hitTestTopmost(25, 70, shapes, 'freeform', getUtil)).toBe(rotated.id);
    expect(hitTestTopmost(95, 5, shapes, 'freeform', getUtil)).toBeNull();
  });

  test('structured lens: draw strokes on top become pointer-invisible', () => {
    const box = shapeFactory({ x: 0, y: 0, width: 100, height: 60 });
    const drawOnTop = shapeFactory({ type: 'draw', x: 0, y: 0, width: 100, height: 60 });
    const shapes = record([box, drawOnTop]);
    const getUtil = utilMap(boxShapeUtilFactory(), boxShapeUtilFactory({ type: 'draw' }));

    expect(hitTestTopmost(50, 30, shapes, 'freeform', getUtil)).toBe(drawOnTop.id);
    expect(hitTestTopmost(50, 30, shapes, 'structured', getUtil)).toBe(box.id);
  });

  test('structured lens: hit-tests at the lens-offset position, not the stored one', () => {
    const shifted = shapeFactory({
      x: 0,
      y: 0,
      width: 100,
      height: 60,
      lensOffset: { dx: 500, dy: 0 },
    });
    const shapes = record([shifted]);
    const getUtil = utilMap(boxShapeUtilFactory());

    expect(hitTestTopmost(550, 30, shapes, 'structured', getUtil)).toBe(shifted.id);
    expect(hitTestTopmost(50, 30, shapes, 'structured', getUtil)).toBeNull();
    // Freeform ignores the offset.
    expect(hitTestTopmost(50, 30, shapes, 'freeform', getUtil)).toBe(shifted.id);
  });
});
