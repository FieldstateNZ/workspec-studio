import { describe, expect, test } from 'vitest';
import { render } from '@testing-library/react';
import { Minimap } from './minimap.js';
import { CanvasProvider } from '../canvas-provider.js';
import { CanvasViewportContext, type CanvasViewport } from '../canvas-viewport.js';
import { createCanvasStore } from '../store/store.js';
import type { CanvasStoreInstance, CanvasStoreOptions } from '../store/store.types.js';
import type { Shape, ShapeId } from '../types.js';
import { shapeFactory } from '../test-helpers/factories.js';

// Minimap injected kind→color map (S2 debt, #119): the map the C4 layer
// feeds (kind → accent token) must colour the dots via the instance's
// kindResolver, with unmapped kinds falling back to var(--line).

const VIEWPORT: CanvasViewport = { width: 800, height: 600, getRect: () => null };

function mount(
  shapes: Shape[],
  kindColors: Record<string, string> | undefined,
  options: CanvasStoreOptions = {},
): { container: HTMLElement; instance: CanvasStoreInstance } {
  const instance = createCanvasStore(options);
  const record: Record<ShapeId, Shape> = {};
  for (const s of shapes) record[s.id] = s;
  instance.getState()._setShapesRaw(record);
  const { container } = render(
    <CanvasProvider store={instance}>
      <CanvasViewportContext.Provider value={VIEWPORT}>
        <Minimap {...(kindColors !== undefined ? { kindColors } : {})} />
      </CanvasViewportContext.Provider>
    </CanvasProvider>,
  );
  return { container, instance };
}

function dotFills(container: HTMLElement): string[] {
  // The last rect is the viewport box; everything before it is a shape dot.
  const rects = [...container.querySelectorAll('rect')];
  return rects.slice(0, -1).map((r) => r.getAttribute('fill') ?? '');
}

describe('Minimap — injected kind colours', () => {
  test('maps dots through the kind→color record; unmapped kinds fall back to var(--line)', () => {
    const box = shapeFactory({ x: 0, y: 0 });
    const note = shapeFactory({ type: 'note', x: 400, y: 300 });
    const { container } = mount([box, note], { box: 'var(--el-system)' });
    expect(dotFills(container).sort()).toEqual(['var(--el-system)', 'var(--line)'].sort());
  });

  test('kinds resolve through the instance kindResolver, not raw shape type', () => {
    const a = shapeFactory({ x: 0, y: 0, meta: { kind: 'actor' } });
    const b = shapeFactory({ x: 400, y: 300, meta: { kind: 'system' } });
    const { container } = mount(
      [a, b],
      { actor: 'var(--el-actor)', system: 'var(--el-system)' },
      { kindResolver: (s) => ((s.meta as { kind?: string } | undefined)?.kind ?? s.type) },
    );
    expect(dotFills(container).sort()).toEqual(['var(--el-actor)', 'var(--el-system)'].sort());
  });

  test('no injected map → every dot falls back to var(--line)', () => {
    const a = shapeFactory({ x: 0, y: 0 });
    const b = shapeFactory({ x: 400, y: 300 });
    const { container } = mount([a, b], undefined);
    expect(dotFills(container)).toEqual(['var(--line)', 'var(--line)']);
  });

  test('hidden below two visible shapes and without a measured viewport', () => {
    const a = shapeFactory({ x: 0, y: 0 });
    const { container } = mount([a], {});
    expect(container.querySelector('svg')).toBeNull();

    // Two shapes but one kind hidden → back under the threshold.
    const b = shapeFactory({ type: 'note', x: 400, y: 300 });
    const instance = createCanvasStore();
    instance.getState()._setShapesRaw({ [a.id]: a, [b.id]: b } as Record<ShapeId, Shape>);
    instance.getState().setHiddenKinds(new Set(['note']));
    const { container: c2 } = render(
      <CanvasProvider store={instance}>
        <CanvasViewportContext.Provider value={VIEWPORT}>
          <Minimap />
        </CanvasViewportContext.Provider>
      </CanvasProvider>,
    );
    expect(c2.querySelector('svg')).toBeNull();
  });
});
