// Test factories (fieldstate-testing house rule: factories, not fixtures —
// every test mints its own data). Excluded from the published build via
// tsconfig.build.json's test-helpers exclusion.
import type { FC } from 'react';
import type { Shape, ShapeId } from '../types.js';
import type { ShapeUtil } from '../shape-util.js';
import type { CanvasPointerEvent } from '../tools/tool-base.js';
import { generateInitialKey, generateKeyAfter } from '../utils/fractional-index.js';

let shapeSeq = 0;
let lastIndex: string | null = null;

/** A fresh rectangular shape with a unique id and a strictly-increasing z-order key. */
export function shapeFactory(overrides: Partial<Shape> = {}): Shape {
  shapeSeq += 1;
  lastIndex = lastIndex === null ? generateInitialKey() : generateKeyAfter(lastIndex);
  return {
    id: `shape-${String(shapeSeq)}` as ShapeId,
    type: 'box',
    x: 0,
    y: 0,
    width: 100,
    height: 60,
    index: lastIndex,
    ...overrides,
  };
}

const NullComponent: FC<{ shape: Shape; isEditing: boolean }> = () => null;

/** A minimal rectangle ShapeUtil (AABB bounds + hit test) for engine tests. */
export function boxShapeUtilFactory(overrides: Partial<ShapeUtil> = {}): ShapeUtil {
  return {
    type: 'box',
    defaultProps: (point) => ({
      type: 'box',
      x: point.x,
      y: point.y,
      width: 100,
      height: 60,
    }),
    getBounds: (shape) => ({ x: shape.x, y: shape.y, width: shape.width, height: shape.height }),
    hitTest: (shape, localPoint) =>
      localPoint.x >= 0 &&
      localPoint.x <= shape.width &&
      localPoint.y >= 0 &&
      localPoint.y <= shape.height,
    canResize: () => true,
    canEditText: () => false,
    Component: NullComponent,
    ...overrides,
  };
}

/** A synthetic tool pointer event (camera-identity: page == screen unless overridden). */
export function pointerEventFactory(
  pageX: number,
  pageY: number,
  overrides: Partial<CanvasPointerEvent> = {},
): CanvasPointerEvent {
  // jsdom builds without a PointerEvent constructor fall back to MouseEvent —
  // tools only forward `originalEvent`, they never require pointer-only fields.
  const originalEvent =
    typeof PointerEvent === 'undefined'
      ? (new MouseEvent('pointermove') as unknown as PointerEvent)
      : new PointerEvent('pointermove');
  return {
    pageX,
    pageY,
    screenX: pageX,
    screenY: pageY,
    buttons: 1,
    shiftKey: false,
    metaKey: false,
    ctrlKey: false,
    pointerId: 1,
    originalEvent,
    ...overrides,
  };
}
