import { beforeEach, describe, expect, test, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { Canvas } from './canvas.js';
import { CanvasProvider } from './canvas-provider.js';
import { createCanvasStore } from './store/store.js';
import { registerWhiteboard } from './register-whiteboard.js';
import type { CanvasStoreInstance } from './store/store.types.js';
import type { Shape, ShapeId } from './types.js';
import { boxShapeUtilFactory, shapeFactory } from './test-helpers/factories.js';

// S4 ledger (#120): marquee and drag driven through the REAL Canvas
// pointer pipeline — native pointer events dispatched at the canvas root
// (usePointerEvents → select tool), not tool methods called directly.

class ResizeObserverStub {
  observe(): void {
    /* noop */
  }
  unobserve(): void {
    /* noop */
  }
  disconnect(): void {
    /* noop */
  }
}

const RECT = {
  x: 0,
  y: 0,
  top: 0,
  left: 0,
  right: 1200,
  bottom: 800,
  width: 1200,
  height: 800,
  toJSON: () => ({}),
} as DOMRect;

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(RECT);
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.releasePointerCapture = vi.fn();
});

function pointer(root: Element, type: string, clientX: number, clientY: number): void {
  act(() => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { clientX, clientY, pointerId: 1, button: 0, buttons: 1 });
    root.dispatchEvent(event);
  });
}

function mount(shapes: Shape[]): { instance: CanvasStoreInstance; root: Element } {
  const instance = createCanvasStore();
  registerWhiteboard(instance);
  instance.shapeUtils.register(boxShapeUtilFactory());
  const record: Record<ShapeId, Shape> = {};
  for (const s of shapes) record[s.id] = s;
  instance.getState()._setShapesRaw(record);
  const { container } = render(
    <CanvasProvider store={instance}>
      <Canvas />
    </CanvasProvider>,
  );
  const root = container.querySelector('[data-canvas-root]');
  if (!root) throw new Error('canvas root missing');
  return { instance, root };
}

describe('real-pipeline marquee', () => {
  test('background drag draws the marquee and selects intersecting shapes on release', () => {
    const inside = shapeFactory({ x: 100, y: 100, width: 80, height: 60 });
    const outside = shapeFactory({ x: 900, y: 700, width: 80, height: 60 });
    const { instance, root } = mount([inside, outside]);

    pointer(root, 'pointerdown', 40, 40);
    pointer(root, 'pointermove', 400, 400);
    // Mid-gesture: the live marquee rectangle exists in the store.
    expect(instance.getState().marquee).toMatchObject({
      startX: 40,
      startY: 40,
      endX: 400,
      endY: 400,
    });
    pointer(root, 'pointerup', 400, 400);

    expect(instance.getState().selectedIds).toEqual(new Set([inside.id]));
    expect(instance.getState().marquee).toBeNull();
  });
});

describe('real-pipeline shape drag', () => {
  test('down-move-up on a shape moves it and commits ONE undoable command', () => {
    const shape = shapeFactory({ x: 100, y: 100, width: 100, height: 60 });
    const { instance, root } = mount([shape]);

    pointer(root, 'pointerdown', 150, 130);
    pointer(root, 'pointermove', 250, 180);
    expect(instance.getState().isDragging).toBe(true);
    pointer(root, 'pointerup', 250, 180);

    expect(instance.getState().shapes[shape.id]).toMatchObject({ x: 200, y: 150 });
    expect(instance.getState().history.stack).toHaveLength(1);
    instance.getState().undo();
    expect(instance.getState().shapes[shape.id]).toMatchObject({ x: 100, y: 100 });
  });
});
