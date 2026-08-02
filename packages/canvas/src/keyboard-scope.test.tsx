import { beforeEach, describe, expect, test, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { Canvas } from './canvas.js';
import { CanvasProvider } from './canvas-provider.js';
import { createCanvasStore } from './store/store.js';
import type { CanvasStoreInstance } from './store/store.types.js';
import type { Shape, ShapeId } from './types.js';
import { boxShapeUtilFactory, shapeFactory } from './test-helpers/factories.js';

// The #118 keyboard-scoping policy under test: 'window' (default,
// enterprise parity), 'root' (multi-canvas safe), 'none'.

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

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  HTMLElement.prototype.setPointerCapture = vi.fn();
});

function seeded(): CanvasStoreInstance {
  const instance = createCanvasStore();
  instance.shapeUtils.register(boxShapeUtilFactory());
  const shape = shapeFactory({ x: 0, y: 0 });
  instance.getState()._setShapesRaw({ [shape.id]: shape } as Record<ShapeId, Shape>);
  instance.getState().select([shape.id]);
  return instance;
}

describe('keyboard shortcut scoping', () => {
  test("default 'window' scope fires without canvas focus (enterprise parity)", () => {
    const instance = seeded();
    render(
      <CanvasProvider store={instance}>
        <Canvas />
      </CanvasProvider>,
    );
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));
    });
    expect(Object.keys(instance.getState().shapes)).toHaveLength(0);
  });

  test("'root' scope: only the focused canvas reacts — two canvases never double-fire", () => {
    const a = seeded();
    const b = seeded();
    const { container } = render(
      <>
        <CanvasProvider store={a}>
          <Canvas shortcutScope="root" />
        </CanvasProvider>
        <CanvasProvider store={b}>
          <Canvas shortcutScope="root" />
        </CanvasProvider>
      </>,
    );
    const roots = container.querySelectorAll('[data-canvas-root]');
    expect(roots).toHaveLength(2);
    const rootA = roots[0];
    if (!rootA) throw new Error('root missing');

    // Root-scoped canvases are focusable.
    expect(rootA.getAttribute('tabindex')).toBe('0');

    // Window-level keys do nothing.
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));
    });
    expect(Object.keys(a.getState().shapes)).toHaveLength(1);
    expect(Object.keys(b.getState().shapes)).toHaveLength(1);

    // A key dispatched inside canvas A deletes in A only.
    act(() => {
      rootA.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    });
    expect(Object.keys(a.getState().shapes)).toHaveLength(0);
    expect(Object.keys(b.getState().shapes)).toHaveLength(1);
  });

  test("'none' scope disables the bindings entirely", () => {
    const instance = seeded();
    const { container } = render(
      <CanvasProvider store={instance}>
        <Canvas shortcutScope="none" />
      </CanvasProvider>,
    );
    const root = container.querySelector('[data-canvas-root]');
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));
      root?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    });
    expect(Object.keys(instance.getState().shapes)).toHaveLength(1);
  });
});
