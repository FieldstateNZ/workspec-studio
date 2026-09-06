import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ContextMenu, ContextMenuItem } from './context-menu.js';
import { CanvasProvider } from '../canvas-provider.js';
import { createCanvasStore } from '../store/store.js';
import type { CanvasStoreInstance } from '../store/store.types.js';
import type { Shape, ShapeId } from '../types.js';
import { boxShapeUtilFactory, shapeFactory } from '../test-helpers/factories.js';

// ContextMenu S2 contracts (#118): store actions wired, the CanvasHost
// moveToContainer bridge with its load-bearing local-undoable fallback,
// and the capability-driven group-container targets.

beforeEach(() => {
  HTMLElement.prototype.setPointerCapture = vi.fn();
});

function seeded(shapes: Shape[]): CanvasStoreInstance {
  const instance = createCanvasStore();
  instance.shapeUtils.register(boxShapeUtilFactory());
  instance.shapeUtils.register(
    boxShapeUtilFactory({
      type: 'frame',
      isGroupContainer: () => true,
      containerTitle: (s) => (s['title'] as string | undefined) ?? 'frame',
    }),
  );
  const record: Record<ShapeId, Shape> = {};
  for (const s of shapes) record[s.id] = s;
  instance.getState()._setShapesRaw(record);
  return instance;
}

function renderMenu(instance: CanvasStoreInstance, ids: ShapeId[], onClose = vi.fn()) {
  render(
    <CanvasProvider store={instance}>
      <ContextMenu x={10} y={10} ids={ids} onClose={onClose} />
    </CanvasProvider>,
  );
  return onClose;
}

describe('ContextMenu — store actions', () => {
  test('z-order, group and delete items drive the store and close the menu', () => {
    const a = shapeFactory();
    const b = shapeFactory();
    const instance = seeded([a, b]);
    const onClose = renderMenu(instance, [a.id, b.id]);

    fireEvent.pointerDown(screen.getByText('Group'));
    const groupId = instance.getState().shapes[a.id]?.groupId;
    expect(groupId).toBeDefined();
    expect(instance.getState().shapes[b.id]?.groupId).toBe(groupId);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('Bring to Front reorders; Delete removes', () => {
    const a = shapeFactory();
    const b = shapeFactory();
    const instance = seeded([a, b]);
    renderMenu(instance, [a.id]);

    fireEvent.pointerDown(screen.getByText('Bring to Front'));
    const order = Object.values(instance.getState().shapes)
      .sort((x, y) => x.index.localeCompare(y.index))
      .map((s) => s.id);
    expect(order).toEqual([b.id, a.id]);
  });

  test('Align & distribute appears only for 2+ positionable shapes', () => {
    const a = shapeFactory();
    const instance = seeded([a]);
    renderMenu(instance, [a.id]);
    expect(screen.queryByText('Align & distribute')).toBeNull();
  });
});

describe('ContextMenu — moveToContainer host bridge', () => {
  test('host returning false falls back to a local undoable containerId edit', () => {
    const a = shapeFactory();
    const frame = shapeFactory({ type: 'frame' });
    const instance = seeded([a, frame]);
    const moveToContainer = vi.fn(() => false);
    instance.host = { moveToContainer };
    renderMenu(instance, [a.id]);

    fireEvent.mouseEnter(screen.getByText('Move to group').parentElement as Element);
    fireEvent.pointerDown(screen.getByText('frame'));

    expect(moveToContainer).toHaveBeenCalledWith([a.id], frame.id);
    expect(instance.getState().shapes[a.id]?.containerId).toBe(frame.id);
    // Fallback is undoable, restoring "not contained at all".
    instance.getState().undo();
    expect(instance.getState().shapes[a.id]?.containerId).toBeUndefined();
  });

  test('host returning true short-circuits the local edit', () => {
    const a = shapeFactory();
    const frame = shapeFactory({ type: 'frame' });
    const instance = seeded([a, frame]);
    instance.host = { moveToContainer: () => true };
    renderMenu(instance, [a.id]);

    fireEvent.mouseEnter(screen.getByText('Move to group').parentElement as Element);
    fireEvent.pointerDown(screen.getByText('frame'));
    expect(instance.getState().shapes[a.id]?.containerId).toBeUndefined();
    expect(instance.getState().history.stack).toHaveLength(0);
  });

  test('containers are excluded from their own selection subtree and from moving', () => {
    const frame = shapeFactory({ type: 'frame' });
    const instance = seeded([frame]);
    renderMenu(instance, [frame.id]);
    // A container selection offers no "Move to group".
    expect(screen.queryByText('Move to group')).toBeNull();
  });
});

describe('ContextMenu — auto-layout capability gate', () => {
  test('shows only when the host wires autoLayout AND a menu-surface shape exists', () => {
    const surface = shapeFactory({ type: 'surface', x: 0, y: 0, width: 500, height: 400 });
    const instance = createCanvasStore();
    instance.shapeUtils.register(boxShapeUtilFactory());
    instance.shapeUtils.register(
      boxShapeUtilFactory({ type: 'surface', isContextMenuSurface: () => true }),
    );
    instance.getState()._setShapesRaw({ [surface.id]: surface } as Record<ShapeId, Shape>);

    const autoLayout = vi.fn();
    instance.host = { autoLayout };
    renderMenu(instance, []);
    fireEvent.pointerDown(screen.getByText('Auto-layout contents'));
    expect(autoLayout).toHaveBeenCalledTimes(1);
  });

  test('absent without the capability shape', () => {
    const a = shapeFactory();
    const instance = seeded([a]);
    instance.host = { autoLayout: vi.fn() };
    renderMenu(instance, [a.id]);
    expect(screen.queryByText('Auto-layout contents')).toBeNull();
  });
});

describe('ContextMenuItem — a row must not steal focus', () => {
  // WHY (A3, #133): every row acts on `pointerdown`, and the browser's
  // mousedown default action then FOCUSES the button. That is inert for the
  // menu's own rows, but the `extraItems` slot can host a row that opens an
  // inline editor (the C4 `Rename` row): the editor input mounts and focuses
  // synchronously, the default action pulls focus onto this button, the
  // input's blur handler commits the unchanged value, and the edit session
  // ends before the user can type. Verified live — without the
  // `preventDefault` below, Rename is a no-op on the served studio.
  test('the row runs its action AND cancels the mousedown default', () => {
    const a = shapeFactory();
    const instance = seeded([a]);
    const onClick = vi.fn();
    render(
      <CanvasProvider store={instance}>
        <ContextMenu
          x={10}
          y={10}
          ids={[a.id]}
          onClose={vi.fn()}
          extraItems={<ContextMenuItem icon={null} label="Rename" onClick={onClick} />}
        />
      </CanvasProvider>,
    );

    const event = new MouseEvent('pointerdown', { bubbles: true, cancelable: true });
    screen.getByText('Rename').dispatchEvent(event);

    expect(onClick).toHaveBeenCalledTimes(1);
    // The mutation that dies here: dropping `e.preventDefault()`.
    expect(event.defaultPrevented).toBe(true);
  });
});
