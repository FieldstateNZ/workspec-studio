import { beforeEach, describe, expect, test, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { Canvas } from './canvas.js';
import { CanvasProvider } from './canvas-provider.js';
import { useCanvasViewport } from './canvas-viewport.js';
import { createCanvasStore } from './store/store.js';
import { screenToPage } from './utils/transforms.js';
import { boxShapeUtilFactory, shapeFactory } from './test-helpers/factories.js';
import type { Shape, ShapeId } from './types.js';

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
  right: 640,
  bottom: 480,
  width: 640,
  height: 480,
  toJSON: () => ({}),
} as DOMRect;

function ViewportProbe() {
  const viewport = useCanvasViewport();
  return (
    <output aria-label="viewport">
      {viewport ? `${String(viewport.width)}x${String(viewport.height)}` : 'none'}
    </output>
  );
}

function seed(instance: ReturnType<typeof createCanvasStore>, shapes: Shape[]): void {
  const record: Record<ShapeId, Shape> = {};
  for (const s of shapes) record[s.id] = s;
  instance.getState()._setShapesRaw(record);
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(RECT);
  // jsdom has no pointer capture; the pan gesture calls it on the root.
  HTMLElement.prototype.setPointerCapture = vi.fn();
});

describe('Canvas — viewport seam', () => {
  test('measures its own root and provides it via CanvasViewportContext', () => {
    const instance = createCanvasStore();
    const { container } = render(
      <CanvasProvider store={instance}>
        <Canvas>
          <ViewportProbe />
        </Canvas>
      </CanvasProvider>,
    );
    expect(screen.getByLabelText('viewport')).toHaveTextContent('640x480');
    const root = container.querySelector('[data-canvas-root]');
    expect(root).not.toBeNull();
    expect(root).toHaveClass('wsc-root');
  });
});

describe('Canvas — camera wiring beneath the viewport provider', () => {
  // Regression pins for the provider-above-consumer bug: Canvas itself
  // renders CanvasViewportContext.Provider, so any viewport-consuming hook
  // called in Canvas's OWN body reads the null default. These tests go
  // through the real component; they fail if the camera/keyboard/wheel
  // wiring ever moves back above the provider.

  test('mod+1 zoom-to-fit frames the content against the measured canvas rect', () => {
    const instance = createCanvasStore();
    seed(instance, [shapeFactory({ x: 0, y: 0, width: 100, height: 50 })]);
    render(
      <CanvasProvider store={instance}>
        <Canvas />
      </CanvasProvider>,
    );

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '1', metaKey: true }));
    });

    // Fit math for the mocked 640x480 rect, 80px pad:
    // zoom = min(4, min(480/100, 320/50)) = 4; centre (50, 25) at viewport centre.
    const cam = instance.getState().camera;
    expect(cam.zoom).toBe(4);
    expect(cam.x).toBeCloseTo(50 - 640 / 2 / 4);
    expect(cam.y).toBeCloseTo(25 - 480 / 2 / 4);
  });

  test('ctrl-wheel zoom anchors at the RECT-TRANSLATED cursor point (offset canvas)', () => {
    // Non-zero rect offset: raw clientX/clientY would anchor the zoom on
    // the wrong page point, so this fails without the rect translation.
    const OFFSET_RECT = {
      x: 200,
      y: 100,
      top: 100,
      left: 200,
      right: 840,
      bottom: 580,
      width: 640,
      height: 480,
      toJSON: () => ({}),
    } as DOMRect;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(OFFSET_RECT);

    const instance = createCanvasStore();
    const { container } = render(
      <CanvasProvider store={instance}>
        <Canvas />
      </CanvasProvider>,
    );
    const root = container.querySelector('[data-canvas-root]');
    if (!root) throw new Error('canvas root missing');

    // Cursor at client (520, 340) = canvas-relative (320, 240).
    const canvasPoint = { x: 320, y: 240 };
    const pageBefore = screenToPage(canvasPoint, instance.getState().camera);
    act(() => {
      root.dispatchEvent(
        new WheelEvent('wheel', {
          ctrlKey: true,
          clientX: 520,
          clientY: 340,
          deltaY: -500,
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    const cam = instance.getState().camera;
    expect(cam.zoom).toBeGreaterThan(1);
    // Zoom invariant: the page point under the cursor must not move.
    const pageAfter = screenToPage(canvasPoint, cam);
    expect(pageAfter.x).toBeCloseTo(pageBefore.x);
    expect(pageAfter.y).toBeCloseTo(pageBefore.y);
  });
});

describe('Canvas — context menu capability gate', () => {
  function rightClick(root: Element, clientX: number, clientY: number): void {
    act(() => {
      root.dispatchEvent(
        new MouseEvent('pointerdown', { button: 2, clientX, clientY, bubbles: true }),
      );
      root.dispatchEvent(
        new MouseEvent('pointerup', { button: 2, clientX, clientY, bubbles: true }),
      );
    });
  }

  test('right-click on empty space inside an isContextMenuSurface shape opens the container menu', () => {
    const instance = createCanvasStore();
    // A pointer-through boundary (hitTest false) that declares the capability —
    // the generalisation of the enterprise hard-coded 'c4_boundary' gate.
    instance.shapeUtils.register(
      boxShapeUtilFactory({
        type: 'boundary',
        hitTest: () => false,
        isContextMenuSurface: () => true,
      }),
    );
    seed(instance, [shapeFactory({ type: 'boundary', x: 0, y: 0, width: 500, height: 400 })]);

    const { container } = render(
      <CanvasProvider store={instance}>
        <Canvas
          renderContextMenu={(menu) => (
            <div data-testid="menu">{`ids:${String(menu.ids.length)}`}</div>
          )}
        />
      </CanvasProvider>,
    );
    const root = container.querySelector('[data-canvas-root]');
    if (!root) throw new Error('canvas root missing');

    rightClick(root, 100, 100);
    expect(screen.getByTestId('menu')).toHaveTextContent('ids:0');
  });

  test('right-click misses shapes without the capability (no menu)', () => {
    const instance = createCanvasStore();
    instance.shapeUtils.register(boxShapeUtilFactory({ type: 'boundary', hitTest: () => false }));
    seed(instance, [shapeFactory({ type: 'boundary', x: 0, y: 0, width: 500, height: 400 })]);

    const { container } = render(
      <CanvasProvider store={instance}>
        <Canvas renderContextMenu={() => <div data-testid="menu" />} />
      </CanvasProvider>,
    );
    const root = container.querySelector('[data-canvas-root]');
    if (!root) throw new Error('canvas root missing');

    rightClick(root, 100, 100);
    expect(screen.queryByTestId('menu')).toBeNull();
  });

  test('right-click on a hit shape opens the menu on that shape and selects it', () => {
    const instance = createCanvasStore();
    instance.shapeUtils.register(boxShapeUtilFactory());
    const shape = shapeFactory({ x: 50, y: 50, width: 100, height: 60 });
    seed(instance, [shape]);

    const { container } = render(
      <CanvasProvider store={instance}>
        <Canvas
          renderContextMenu={(menu) => <div data-testid="menu">{menu.ids.join(',')}</div>}
        />
      </CanvasProvider>,
    );
    const root = container.querySelector('[data-canvas-root]');
    if (!root) throw new Error('canvas root missing');

    rightClick(root, 100, 80);
    expect(screen.getByTestId('menu')).toHaveTextContent(shape.id);
    expect(instance.getState().selectedIds).toEqual(new Set([shape.id]));
  });
});
