import { describe, expect, test } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CanvasProvider } from '../../canvas-provider.js';
import { StickyShapeComponent } from './sticky-shape.js';
import { createCanvasStore } from '../../store/store.js';
import type { StickyShape } from '../../shape-types.js';
import type { CanvasStoreInstance, Shape, ShapeId } from '../../index.js';
import { shapeFactory } from '../../test-helpers/factories.js';

// Sticky promote/demote (S2 debt, #119): the structured-lens loose-chip →
// typed-artifact-card lifecycle (enterprise #360/#361).

function seededSticky(overrides: Partial<StickyShape> = {}): {
  instance: CanvasStoreInstance;
  sticky: StickyShape;
} {
  const instance = createCanvasStore();
  const base = shapeFactory({ type: 'sticky', x: 0, y: 0, width: 210, height: 150 });
  const sticky: StickyShape = {
    ...base,
    type: 'sticky',
    text: 'raw thought',
    color: 'yellow',
    ...overrides,
  };
  instance.getState()._setShapesRaw({ [sticky.id]: sticky } as Record<ShapeId, Shape>);
  instance.getState().setLens('structured');
  return { instance, sticky };
}

function renderSticky(instance: CanvasStoreInstance, id: ShapeId): void {
  const shape = instance.getState().shapes[id] as StickyShape;
  render(
    <CanvasProvider store={instance}>
      <StickyShapeComponent shape={shape} isEditing={false} />
    </CanvasProvider>,
  );
}

describe('sticky promote (loose chip → typed artifact card)', () => {
  test("'type it →' opens the picker; picking a type writes noteType and selects the note", () => {
    const { instance, sticky } = seededSticky();
    renderSticky(instance, sticky.id);

    // Untyped note on the structured lens = the LOOSE · UNTYPED chip.
    expect(screen.getByText('LOOSE · UNTYPED')).toBeDefined();
    fireEvent.click(screen.getByText('type it →'));

    // Inline picker offers the four note types in spec order.
    for (const label of ['USER NEED', 'IDEA', 'PAIN', 'QUESTION']) {
      expect(screen.getByText(label)).toBeDefined();
    }
    fireEvent.click(screen.getByText('IDEA'));

    expect(instance.getState().shapes[sticky.id]?.['noteType']).toBe('idea');
    expect(instance.getState().selectedIds.has(sticky.id)).toBe(true);
  });

  test('the picker select-first contract: opening it selects the note before promoting', () => {
    const { instance, sticky } = seededSticky();
    renderSticky(instance, sticky.id);
    fireEvent.click(screen.getByText('type it →'));
    expect(instance.getState().selectedIds.has(sticky.id)).toBe(true);
  });
});

describe('sticky demote (typed artifact card → loose chip)', () => {
  test("'make loose' clears noteType", () => {
    const { instance, sticky } = seededSticky({ noteType: 'pain', title: 'Slow builds' });
    renderSticky(instance, sticky.id);

    // Typed card face: the type eyebrow renders (both lens faces carry it).
    expect(screen.getAllByText('PAIN').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Slow builds').length).toBeGreaterThanOrEqual(1);

    fireEvent.click(screen.getByText('make loose'));
    expect(instance.getState().shapes[sticky.id]?.['noteType']).toBeUndefined();
  });
});
