import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { z } from 'zod';
import type { FC } from 'react';
import { createCanvasStore } from './store/store.js';
import { registerWhiteboard } from './register-whiteboard.js';
import { CanvasProvider } from './canvas-provider.js';
import { ShapeLayer } from './components/shape-layer.js';
import { SelectionLayer } from './components/selection-layer.js';
import type { ShapeModule, ShapeUtil } from './shape-util.js';
import type { Shape, ShapeId } from './types.js';
import { hitTestPointInRect } from './utils/geometry.js';
import { boxShapeUtilFactory, pointerEventFactory, shapeFactory } from './test-helpers/factories.js';

// #118 acceptance: a SECOND, dummy shape module registered next to the
// whiteboard set proves the registry is open — the closed 20-member
// enterprise union is gone. The dummy exercises Component rendering
// through the real ShapeLayer, hit-testing through the real select tool,
// capability hooks, and module schemas.

type StampShape = Shape & { type: 'stamp'; glyph: string };

const StampComponent: FC<{ shape: StampShape; isEditing: boolean }> = ({ shape }) => (
  <output aria-label={`stamp-${shape.id}`}>{shape.glyph}</output>
);

const stampUtil: ShapeUtil<StampShape> = {
  type: 'stamp',
  defaultProps: (point) => ({
    type: 'stamp',
    x: point.x,
    y: point.y,
    width: 40,
    height: 40,
    glyph: '★',
  }),
  getBounds: (s) => ({ x: s.x, y: s.y, width: s.width, height: s.height }),
  hitTest: (s, local) =>
    hitTestPointInRect(local, { x: 0, y: 0, width: s.width, height: s.height }),
  canResize: () => false,
  canEditText: () => false,
  selfRendersSelection: () => true,
  Component: StampComponent,
};

const stampModule: ShapeModule<StampShape> = {
  type: 'stamp',
  util: stampUtil,
  schema: z.object({ type: z.literal('stamp'), glyph: z.string() }).loose(),
};

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
});

describe('open shape-module registry', () => {
  test('a dummy module registers beside the whiteboard set and renders through ShapeLayer', () => {
    const instance = createCanvasStore();
    registerWhiteboard(instance);
    instance.shapeUtils.registerModule(stampModule);

    // Both the whiteboard types and the dummy are registered on THIS instance.
    expect(instance.shapeUtils.types()).toEqual(
      expect.arrayContaining(['sticky', 'text', 'draw', 'image', 'connector', 'stamp']),
    );

    const stamp = shapeFactory({ type: 'stamp', x: 10, y: 10, width: 40, height: 40 });
    const sticky = shapeFactory({ type: 'sticky', x: 200, y: 10, width: 210, height: 150 });
    instance.getState()._setShapesRaw({
      [stamp.id]: { ...stamp, glyph: '★' },
      [sticky.id]: { ...sticky, text: 'hello', color: 'yellow' },
    } as Record<ShapeId, Shape>);

    render(
      <CanvasProvider store={instance}>
        <ShapeLayer />
      </CanvasProvider>,
    );
    expect(screen.getByLabelText(`stamp-${stamp.id}`)).toHaveTextContent('★');
    // The sticky renders both lens faces (freeform paper + structured chip).
    expect(screen.getAllByText('hello').length).toBeGreaterThanOrEqual(1);
  });

  test('the dummy module is hit-testable through the real select tool', () => {
    const instance = createCanvasStore();
    instance.shapeUtils.registerModule(stampModule);
    const stamp = shapeFactory({ type: 'stamp', x: 100, y: 100, width: 40, height: 40 });
    instance.getState()._setShapesRaw({ [stamp.id]: { ...stamp, glyph: '★' } } as Record<
      ShapeId,
      Shape
    >);

    const select = instance.tools.get('select');
    select?.onPointerDown?.(pointerEventFactory(120, 120), instance.getState());
    expect(instance.getState().selectedIds).toEqual(new Set([stamp.id]));
  });

  test('module schemas are retrievable for host-side validation', () => {
    const instance = createCanvasStore();
    instance.shapeUtils.registerModule(stampModule);
    const module = instance.shapeUtils.getModule('stamp');
    expect(module?.schema).toBeDefined();
    expect(module?.schema?.safeParse({ type: 'stamp', glyph: '★' }).success).toBe(true);
    expect(module?.schema?.safeParse({ type: 'stamp', glyph: 7 }).success).toBe(false);
    // Bare-util registrations surface as schema-less modules.
    instance.shapeUtils.register(boxShapeUtilFactory({ type: 'plain' }));
    expect(instance.shapeUtils.getModule('plain')?.schema).toBeUndefined();
  });

  test('selfRendersSelection modules suppress the SelectionLayer rect; plain ones get it', () => {
    const instance = createCanvasStore();
    instance.shapeUtils.registerModule(stampModule);
    instance.shapeUtils.register(boxShapeUtilFactory({ type: 'plain' }));
    const stamp = shapeFactory({ type: 'stamp', x: 0, y: 0, width: 40, height: 40 });
    const plain = shapeFactory({ type: 'plain', x: 100, y: 0, width: 40, height: 40 });
    instance.getState()._setShapesRaw({
      [stamp.id]: { ...stamp, glyph: '★' },
      [plain.id]: plain,
    } as Record<ShapeId, Shape>);
    instance.getState().select([stamp.id, plain.id]);

    const { container } = render(
      <CanvasProvider store={instance}>
        <SelectionLayer />
      </CanvasProvider>,
    );
    // Exactly ONE selection rect: the plain shape's (the stamp opts out).
    expect(container.querySelectorAll('rect')).toHaveLength(1);
  });
});
