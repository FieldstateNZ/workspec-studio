import { act, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { CanvasProvider, useCanvasHover, useCanvasStore } from './canvas-provider.js';
import { createCanvasStore } from './store/store.js';
import type { ShapeId } from './types.js';
import { shapeFactory } from './test-helpers/factories.js';

function ShapeCountProbe({ label }: { label: string }) {
  const count = useCanvasStore((s) => Object.keys(s.shapes).length);
  const selected = useCanvasStore((s) => s.selectedIds.size);
  return <output aria-label={label}>{`shapes:${String(count)} selected:${String(selected)}`}</output>;
}

function WholeStateProbe() {
  const state = useCanvasStore();
  return <output aria-label="whole">{typeof state.createShape}</output>;
}

function HoverProbe({ label }: { label: string }) {
  const hoveredId = useCanvasHover((s) => s.hoveredId);
  return <output aria-label={label}>{hoveredId ?? 'none'}</output>;
}

describe('CanvasProvider + useCanvasStore contract', () => {
  test('useCanvasStore keeps the enterprise call signature: selector slice + whole-state form', () => {
    const instance = createCanvasStore();
    render(
      <CanvasProvider store={instance}>
        <ShapeCountProbe label="probe" />
        <WholeStateProbe />
      </CanvasProvider>,
    );
    expect(screen.getByLabelText('probe')).toHaveTextContent('shapes:0 selected:0');
    // The no-selector overload returns the full store (actions included).
    expect(screen.getByLabelText('whole')).toHaveTextContent('function');

    const shape = shapeFactory();
    act(() => {
      instance.getState().createShape(shape);
      instance.getState().select([shape.id]);
    });
    expect(screen.getByLabelText('probe')).toHaveTextContent('shapes:1 selected:1');
  });

  test('two providers on one page are fully isolated (shapes, selection, undo)', () => {
    const a = createCanvasStore();
    const b = createCanvasStore();
    render(
      <>
        <CanvasProvider store={a}>
          <ShapeCountProbe label="canvas-a" />
        </CanvasProvider>
        <CanvasProvider store={b}>
          <ShapeCountProbe label="canvas-b" />
        </CanvasProvider>
      </>,
    );

    const shapeA = shapeFactory();
    const shapeB = shapeFactory();
    act(() => {
      a.getState().createShape(shapeA);
      a.getState().select([shapeA.id]);
      b.getState().createShape(shapeB);
    });
    expect(screen.getByLabelText('canvas-a')).toHaveTextContent('shapes:1 selected:1');
    expect(screen.getByLabelText('canvas-b')).toHaveTextContent('shapes:1 selected:0');

    // Undo in A must not touch B's document.
    act(() => {
      a.getState().undo();
    });
    expect(screen.getByLabelText('canvas-a')).toHaveTextContent('shapes:0 selected:1');
    expect(screen.getByLabelText('canvas-b')).toHaveTextContent('shapes:1 selected:0');
  });

  test('useCanvasHover is provider-scoped', () => {
    const a = createCanvasStore();
    const b = createCanvasStore();
    render(
      <>
        <CanvasProvider store={a}>
          <HoverProbe label="hover-a" />
        </CanvasProvider>
        <CanvasProvider store={b}>
          <HoverProbe label="hover-b" />
        </CanvasProvider>
      </>,
    );
    act(() => {
      a.hover.getState().setHovered('hovered-shape' as ShapeId);
    });
    expect(screen.getByLabelText('hover-a')).toHaveTextContent('hovered-shape');
    expect(screen.getByLabelText('hover-b')).toHaveTextContent('none');
  });

  test('useCanvasStore outside a provider throws a wiring error', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<ShapeCountProbe label="orphan" />)).toThrow(
      /outside <CanvasProvider>/,
    );
    errorSpy.mockRestore();
  });
});
