import { act, renderHook } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import type { ReactNode } from 'react';
import { computeFitCamera, useCamera } from './use-camera.js';
import { CanvasProvider } from '../canvas-provider.js';
import { CanvasViewportContext, type CanvasViewport } from '../canvas-viewport.js';
import { createCanvasStore } from '../store/store.js';
import type { CanvasStoreInstance } from '../store/store.types.js';
import { pageToScreen, screenToPage } from '../utils/transforms.js';
import { shapeFactory } from '../test-helpers/factories.js';
import type { Shape, ShapeId } from '../types.js';

function seed(instance: CanvasStoreInstance, shapes: Shape[]): void {
  const record: Record<ShapeId, Shape> = {};
  for (const s of shapes) record[s.id] = s;
  instance.getState()._setShapesRaw(record);
}

function wrapperFor(instance: CanvasStoreInstance, viewport?: CanvasViewport) {
  return function Wrapper({ children }: { children: ReactNode }) {
    const inner = viewport ? (
      <CanvasViewportContext.Provider value={viewport}>{children}</CanvasViewportContext.Provider>
    ) : (
      children
    );
    return <CanvasProvider store={instance}>{inner}</CanvasProvider>;
  };
}

describe('computeFitCamera (pure)', () => {
  test('empty canvas → identity camera', () => {
    expect(computeFitCamera({}, { width: 800, height: 600 })).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  test('frames content centred with 80px padding, clamped to MAX_ZOOM', () => {
    const shapes = { a: { x: 0, y: 0, width: 100, height: 50 } };
    const cam = computeFitCamera(shapes, { width: 800, height: 600 });
    // zoom = min((800-160)/100, (600-160)/50) = 6.4 → clamped to 4.
    expect(cam.zoom).toBe(4);
    // Content centre (50, 25) lands at the viewport centre.
    expect(cam.x).toBeCloseTo(50 - 800 / 2 / 4);
    expect(cam.y).toBeCloseTo(25 - 600 / 2 / 4);
  });

  test('vast content clamps to MIN_ZOOM', () => {
    const shapes = {
      a: { x: 0, y: 0, width: 100_000, height: 100 },
    };
    expect(computeFitCamera(shapes, { width: 800, height: 600 }).zoom).toBe(0.1);
  });
});

describe('transforms', () => {
  test('screenToPage inverts pageToScreen at any camera', () => {
    const camera = { x: -37.5, y: 120, zoom: 1.75 };
    const p = { x: 41.25, y: -19 };
    const roundTripped = screenToPage(pageToScreen(p, camera), camera);
    expect(roundTripped.x).toBeCloseTo(p.x);
    expect(roundTripped.y).toBeCloseTo(p.y);
  });
});

describe('useCamera', () => {
  test('zoomAround keeps the page point under the cursor fixed', () => {
    const instance = createCanvasStore();
    instance.getState().setCamera({ x: 10, y: 20, zoom: 1 });
    const { result } = renderHook(() => useCamera(), { wrapper: wrapperFor(instance) });

    const cursor = { x: 150, y: 90 };
    const before = screenToPage(cursor, instance.getState().camera);
    act(() => {
      result.current.zoomAround(cursor.x, cursor.y, -400);
    });
    const after = screenToPage(cursor, instance.getState().camera);
    expect(instance.getState().camera.zoom).not.toBe(1);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  test('zoomByFactor clamps to the 0.1–4 zoom range', () => {
    const instance = createCanvasStore();
    const { result } = renderHook(() => useCamera(), { wrapper: wrapperFor(instance) });
    act(() => {
      result.current.zoomByFactor(100, 0, 0);
    });
    expect(instance.getState().camera.zoom).toBe(4);
    act(() => {
      result.current.zoomByFactor(0.000001, 0, 0);
    });
    expect(instance.getState().camera.zoom).toBe(0.1);
  });

  test('zoomToFit defaults to the measured canvas viewport (the seam), not the window', () => {
    const instance = createCanvasStore();
    seed(instance, [shapeFactory({ x: 0, y: 0, width: 100, height: 50 })]);
    const viewport: CanvasViewport = { width: 800, height: 600, getRect: () => null };
    const { result } = renderHook(() => useCamera(), {
      wrapper: wrapperFor(instance, viewport),
    });
    act(() => {
      result.current.zoomToFit();
    });
    expect(instance.getState().camera.zoom).toBe(4);
    expect(instance.getState().camera.x).toBeCloseTo(50 - 800 / 2 / 4);
  });

  test('zoomToFit with no explicit viewport and no measurable canvas is a no-op', () => {
    const instance = createCanvasStore();
    seed(instance, [shapeFactory()]);
    instance.getState().setCamera({ x: 3, y: 4, zoom: 2 });
    const { result } = renderHook(() => useCamera(), { wrapper: wrapperFor(instance) });
    act(() => {
      result.current.zoomToFit();
    });
    expect(instance.getState().camera).toEqual({ x: 3, y: 4, zoom: 2 });
  });

  test('zoomToFit frames structured-lens offsets via effectivePosition', () => {
    const instance = createCanvasStore();
    seed(instance, [
      shapeFactory({ x: 0, y: 0, width: 100, height: 100, lensOffset: { dx: 900, dy: 0 } }),
    ]);
    instance.getState().setLens('structured');
    const { result } = renderHook(() => useCamera(), { wrapper: wrapperFor(instance) });
    act(() => {
      result.current.zoomToFit({ width: 800, height: 600 });
    });
    // Freeform bounds would be 100 wide; the offset shape sits at x=900,
    // so the framed centre must reflect the offset position.
    const cam = instance.getState().camera;
    const centreX = cam.x + 800 / 2 / cam.zoom;
    expect(centreX).toBeCloseTo(950);
  });

  test('wheel without modifier pans by delta/zoom; with ctrl it zooms', () => {
    const instance = createCanvasStore();
    instance.getState().setCamera({ x: 0, y: 0, zoom: 2 });
    const { result } = renderHook(() => useCamera(), { wrapper: wrapperFor(instance) });

    act(() => {
      result.current.handleWheel(new WheelEvent('wheel', { deltaX: 10, deltaY: 20 }));
    });
    expect(instance.getState().camera.x).toBeCloseTo(5);
    expect(instance.getState().camera.y).toBeCloseTo(10);
    expect(instance.getState().camera.zoom).toBe(2);

    act(() => {
      result.current.handleWheel(new WheelEvent('wheel', { deltaY: -200, ctrlKey: true }));
    });
    expect(instance.getState().camera.zoom).toBeGreaterThan(2);
  });
});
