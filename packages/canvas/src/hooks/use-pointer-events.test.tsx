import { beforeEach, describe, expect, test, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { Canvas } from '../canvas.js';
import { CanvasProvider } from '../canvas-provider.js';
import { createCanvasStore } from '../store/store.js';
import { createHandTool } from '../tools/hand-tool.js';
import type { CanvasStoreInstance } from '../store/store.types.js';
import type { Shape, ShapeId } from '../types.js';
import { boxShapeUtilFactory, shapeFactory } from '../test-helpers/factories.js';

// Pointer-hook contract tests (S1 debt, #118): the `?? select` fallback,
// space-pan gating on hand-tool registration, [data-canvas-ui]
// passthrough, right-drag pan vs right-click menu, and the hover feed —
// all through the REAL <Canvas> wiring.

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
  right: 800,
  bottom: 600,
  width: 800,
  height: 600,
  toJSON: () => ({}),
} as DOMRect;

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(RECT);
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.releasePointerCapture = vi.fn();
});

function mountCanvas(instance: CanvasStoreInstance): Element {
  const { container } = render(
    <CanvasProvider store={instance}>
      <Canvas />
    </CanvasProvider>,
  );
  const root = container.querySelector('[data-canvas-root]');
  if (!root) throw new Error('canvas root missing');
  return root;
}

function pointer(
  root: Element,
  type: string,
  clientX: number,
  clientY: number,
  init: MouseEventInit = {},
): void {
  act(() => {
    root.dispatchEvent(new MouseEvent(type, { clientX, clientY, bubbles: true, ...init }));
  });
}

function seededInstance(): { instance: CanvasStoreInstance; shape: Shape } {
  const instance = createCanvasStore();
  instance.shapeUtils.register(boxShapeUtilFactory());
  const shape = shapeFactory({ x: 100, y: 100, width: 100, height: 60 });
  instance.getState()._setShapesRaw({ [shape.id]: shape } as Record<ShapeId, Shape>);
  return { instance, shape };
}

describe('usePointerEvents — tool dispatch', () => {
  test('an unregistered active tool falls back to the select tool', () => {
    const { instance, shape } = seededInstance();
    const root = mountCanvas(instance);

    instance.getState().setActiveTool('made-up-tool');
    pointer(root, 'pointerdown', 150, 130, { button: 0 });
    pointer(root, 'pointerup', 150, 130, { button: 0 });
    // The select tool handled the gesture: the shape got selected.
    expect(instance.getState().selectedIds).toEqual(new Set([shape.id]));
  });

  test('[data-canvas-ui] elements pass through without reaching the tool', () => {
    const { instance, shape } = seededInstance();
    const { container } = render(
      <CanvasProvider store={instance}>
        <Canvas>
          <button data-canvas-ui data-testid="chrome-button" type="button">
            chrome
          </button>
        </Canvas>
      </CanvasProvider>,
    );
    const button = container.querySelector('[data-testid="chrome-button"]');
    if (!button) throw new Error('button missing');
    act(() => {
      button.dispatchEvent(
        new MouseEvent('pointerdown', { clientX: 150, clientY: 130, bubbles: true, button: 0 }),
      );
    });
    // The tool never ran — nothing got selected even though the coords hit the shape.
    expect(instance.getState().selectedIds.size).toBe(0);
    void shape;
  });

  test('pointer moves feed the hover store; leaving the canvas clears it', () => {
    const { instance, shape } = seededInstance();
    const root = mountCanvas(instance);

    pointer(root, 'pointermove', 150, 130);
    expect(instance.hover.getState().hoveredId).toBe(shape.id);

    pointer(root, 'pointermove', 500, 500);
    expect(instance.hover.getState().hoveredId).toBeNull();

    pointer(root, 'pointermove', 150, 130);
    pointer(root, 'pointerleave', 0, 0);
    expect(instance.hover.getState().hoveredId).toBeNull();
  });
});

describe('usePointerEvents — right-button gesture', () => {
  test('right-drag pans the camera and suppresses the context menu', () => {
    const { instance } = seededInstance();
    const root = mountCanvas(instance);

    pointer(root, 'pointerdown', 400, 300, { button: 2 });
    pointer(root, 'pointermove', 350, 260, { buttons: 2 });
    // Camera moved opposite the drag (screen delta / zoom).
    expect(instance.getState().camera).toMatchObject({ x: 50, y: 40 });
    pointer(root, 'pointerup', 350, 260, { button: 2 });
    // A drag is not a click: no menu → no selection clearing side-effects.
    expect(instance.getState().camera.zoom).toBe(1);
  });
});

describe('usePointerEvents — pointer capture is a DRAG affordance, not a click one', () => {
  // WHY THESE EXIST (A3, #133). Capturing the pointer on `pointerdown` makes
  // the browser retarget the gesture's compatibility mouse events
  // (`mouseup`/`click`/`dblclick`) to the capturing element — so a shape's
  // own DOM handlers stop firing, and the C4 card's double-click (the only
  // route to the studio's element editor) silently dies. jsdom implements
  // neither pointer capture nor that retargeting, which is exactly why no
  // existing test could see it; these assert the TIMING instead, which is
  // the property the browser behaviour hangs off.

  test('a click never captures the pointer — the shape keeps its DOM click/dblclick', () => {
    const { instance } = seededInstance();
    const root = mountCanvas(instance);
    const capture = HTMLElement.prototype.setPointerCapture as ReturnType<typeof vi.fn>;

    pointer(root, 'pointerdown', 150, 130, { button: 0 });
    pointer(root, 'pointerup', 150, 130, { button: 0 });

    // Mutation that dies here: taking the capture in `handlePointerDown`
    // (the pre-fix code, and enterprise's).
    expect(capture).not.toHaveBeenCalled();
  });

  test('a jitter under the drag threshold still does not capture', () => {
    const { instance } = seededInstance();
    const root = mountCanvas(instance);
    const capture = HTMLElement.prototype.setPointerCapture as ReturnType<typeof vi.fn>;

    pointer(root, 'pointerdown', 150, 130, { button: 0 });
    pointer(root, 'pointermove', 152, 131, { buttons: 1 });
    pointer(root, 'pointerup', 152, 131, { button: 0 });

    expect(capture).not.toHaveBeenCalled();
  });

  test('a real drag captures once, on the first move past the threshold', () => {
    const { instance } = seededInstance();
    const root = mountCanvas(instance);
    const capture = HTMLElement.prototype.setPointerCapture as ReturnType<typeof vi.fn>;

    pointer(root, 'pointerdown', 150, 130, { button: 0, pointerId: 7 } as MouseEventInit);
    pointer(root, 'pointermove', 200, 180, { buttons: 1 });
    pointer(root, 'pointermove', 260, 240, { buttons: 1 });

    // Mutation that dies here: dropping the lazy capture entirely — a drag
    // that leaves the canvas would then stop receiving moves.
    expect(capture).toHaveBeenCalledTimes(1);

    pointer(root, 'pointerup', 260, 240, { button: 0 });
    // A second gesture re-arms rather than reusing the stale capture.
    pointer(root, 'pointerdown', 150, 130, { button: 0 });
    pointer(root, 'pointerup', 150, 130, { button: 0 });
    expect(capture).toHaveBeenCalledTimes(1);
  });
});

describe('keyboard tool keys — registration gate (S1 debt)', () => {
  // The gate lives in useKeyboardShortcuts, exercised here through the
  // real <Canvas> wiring alongside the other pointer-pipeline contracts.
  test('a tool key for an UNREGISTERED tool no-ops; registering the tool activates it', () => {
    const { instance } = seededInstance();
    mountCanvas(instance);
    expect(instance.tools.get('draw')).toBeUndefined();

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' }));
    });
    expect(instance.getState().activeTool).toBe('select');

    instance.tools.register({ name: 'draw', cursor: 'crosshair' });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' }));
    });
    expect(instance.getState().activeTool).toBe('draw');

    // 'v' returns to select (always registered).
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'V' }));
    });
    expect(instance.getState().activeTool).toBe('select');
  });

  test('unregistered-tool keys never mask other bindings (mod+1 still fits after a dead key)', () => {
    const { instance, shape } = seededInstance();
    mountCanvas(instance);
    void shape;
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h' })); // hand unregistered
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '1', metaKey: true }));
    });
    expect(instance.getState().activeTool).toBe('select');
    expect(instance.getState().camera.zoom).not.toBe(1); // zoom-to-fit ran
  });
});

describe('usePointerEvents — space-pan gating (S1 debt)', () => {
  test('space is ignored while no hand tool is registered', () => {
    const { instance } = seededInstance();
    mountCanvas(instance);
    expect(instance.tools.get('hand')).toBeUndefined();

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    });
    expect(instance.getState().activeTool).toBe('select');
  });

  test('with a hand tool registered, space switches and keyup restores', () => {
    const { instance } = seededInstance();
    instance.tools.register(createHandTool());
    mountCanvas(instance);

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    });
    expect(instance.getState().activeTool).toBe('hand');

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));
    });
    expect(instance.getState().activeTool).toBe('select');
  });

  test('root scope: focus leaving the canvas mid-hold releases the space pan (FIX 5)', () => {
    const instance = createCanvasStore();
    instance.shapeUtils.register(boxShapeUtilFactory());
    instance.tools.register(createHandTool());
    const { container } = render(
      <CanvasProvider store={instance}>
        <Canvas shortcutScope="root" />
      </CanvasProvider>,
    );
    const root = container.querySelector('[data-canvas-root]');
    if (!root) throw new Error('canvas root missing');

    act(() => {
      root.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
    });
    expect(instance.getState().activeTool).toBe('hand');

    // Focus exits the canvas — the keyup will never arrive at the root.
    act(() => {
      root.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }));
    });
    expect(instance.getState().activeTool).toBe('select');

    // Focus moving WITHIN the canvas must not release the hold.
    act(() => {
      root.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
      root.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: root }));
    });
    expect(instance.getState().activeTool).toBe('hand');
  });
});
