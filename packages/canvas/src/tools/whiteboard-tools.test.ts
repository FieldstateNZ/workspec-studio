import { describe, expect, test, vi } from 'vitest';
import { createCanvasStore } from '../store/store.js';
import { registerWhiteboard } from '../register-whiteboard.js';
import type { CanvasStoreInstance } from '../store/store.types.js';
import type { Shape, ShapeId } from '../types.js';
import type { ShapeUtil } from '../shape-util.js';
import { hitTestPointInRect } from '../utils/geometry.js';
import { pointerEventFactory, shapeFactory } from '../test-helpers/factories.js';

function whiteboardInstance(): CanvasStoreInstance {
  const instance = createCanvasStore();
  registerWhiteboard(instance);
  return instance;
}

function toolOf(instance: CanvasStoreInstance, name: string) {
  const tool = instance.tools.get(name);
  if (!tool) throw new Error(`${name} tool missing`);
  return tool;
}

describe('registerWhiteboard', () => {
  test('installs the full enterprise tool set + shape modules on the instance', () => {
    const instance = whiteboardInstance();
    expect([...instance.tools.names()].sort()).toEqual(
      ['connector', 'draw', 'hand', 'place', 'select', 'sticky', 'text'].sort(),
    );
    expect([...instance.shapeUtils.types()].sort()).toEqual(
      ['connector', 'draw', 'image', 'sticky', 'text'].sort(),
    );
  });
});

describe('hand tool', () => {
  test('dragging pans the camera opposite the pointer delta, scaled by zoom', () => {
    const instance = whiteboardInstance();
    instance.getState().setCamera({ x: 0, y: 0, zoom: 2 });
    const hand = toolOf(instance, 'hand');

    hand.onPointerDown?.(pointerEventFactory(100, 100), instance.getState());
    hand.onPointerMove?.(
      pointerEventFactory(160, 130, { screenX: 160, screenY: 130 }),
      instance.getState(),
    );
    expect(instance.getState().camera).toEqual({ x: -30, y: -15, zoom: 2 });

    hand.onPointerUp?.(pointerEventFactory(160, 130), instance.getState());
    // Gesture over: further moves don't pan.
    hand.onPointerMove?.(pointerEventFactory(300, 300), instance.getState());
    expect(instance.getState().camera).toEqual({ x: -30, y: -15, zoom: 2 });
  });
});

describe('draw tool', () => {
  test('a stroke streams raw, simplifies on release, and is ONE undoable command', () => {
    const instance = whiteboardInstance();
    const draw = toolOf(instance, 'draw');

    draw.onPointerDown?.(pointerEventFactory(10, 10), instance.getState());
    // Collinear midpoints — RDP should drop them at tolerance 1.
    draw.onPointerMove?.(pointerEventFactory(30, 10), instance.getState());
    draw.onPointerMove?.(pointerEventFactory(50, 10), instance.getState());
    draw.onPointerMove?.(pointerEventFactory(70, 10), instance.getState());
    // Live transient shape exists but no history.
    expect(Object.keys(instance.getState().shapes)).toHaveLength(1);
    expect(instance.getState().history.stack).toHaveLength(0);

    draw.onPointerUp?.(pointerEventFactory(70, 10), instance.getState());
    const committed = Object.values(instance.getState().shapes)[0];
    expect(committed).toMatchObject({ type: 'draw', x: 10, y: 10 });
    // Simplified to the two endpoints, in shape-local coordinates.
    expect(committed?.['points']).toEqual([
      { x: 0, y: 0 },
      { x: 60, y: 0 },
    ]);
    expect(instance.getState().history.stack).toHaveLength(1);

    instance.getState().undo();
    expect(Object.keys(instance.getState().shapes)).toHaveLength(0);
    instance.getState().redo();
    expect(Object.keys(instance.getState().shapes)).toHaveLength(1);
  });
});

describe('sticky + text tools', () => {
  test('sticky click creates a centred default note, selects it, enters editing, returns to select', () => {
    const instance = whiteboardInstance();
    const sticky = toolOf(instance, 'sticky');

    sticky.onPointerDown?.(pointerEventFactory(300, 200), instance.getState());
    const created = Object.values(instance.getState().shapes)[0];
    expect(created).toMatchObject({
      type: 'sticky',
      x: 300 - 105,
      y: 200 - 75,
      width: 210,
      height: 150,
      color: 'yellow',
    });
    expect(created && instance.getState().selectedIds.has(created.id)).toBe(true);
    expect(instance.getState().editingId).toBe(created?.id);
    expect(instance.getState().activeTool).toBe('select');
    // Creation is undoable.
    expect(instance.getState().history.stack).toHaveLength(1);
  });

  test('text click creates an editing text shape at the cursor', () => {
    const instance = whiteboardInstance();
    const text = toolOf(instance, 'text');
    text.onPointerDown?.(pointerEventFactory(40, 50), instance.getState());
    const created = Object.values(instance.getState().shapes)[0];
    expect(created).toMatchObject({ type: 'text', x: 40, y: 50, fontSize: 16 });
    expect(instance.getState().editingId).toBe(created?.id);
    expect(instance.getState().activeTool).toBe('select');
  });
});

describe('connector tool', () => {
  function connectable(type: string): ShapeUtil {
    return {
      type,
      defaultProps: (p) => ({ type, x: p.x, y: p.y, width: 120, height: 80 }),
      getBounds: (s) => ({ x: s.x, y: s.y, width: s.width, height: s.height }),
      hitTest: (s, local) =>
        hitTestPointInRect(local, { x: 0, y: 0, width: s.width, height: s.height }),
      canResize: () => false,
      canEditText: () => false,
      isConnectable: () => true,
      connectorKey: (s) => `key-${s.id}`,
      Component: () => null,
    };
  }

  test('drag between capability-connectable nodes commits via host.createEdge', () => {
    const instance = whiteboardInstance();
    instance.shapeUtils.register(connectable('node'));
    const createEdge = vi.fn();
    instance.host = { createEdge };

    const a = shapeFactory({ type: 'node', x: 0, y: 0, width: 120, height: 80 });
    const b = shapeFactory({ type: 'node', x: 400, y: 0, width: 120, height: 80 });
    instance.getState()._setShapesRaw({ [a.id]: a, [b.id]: b } as Record<ShapeId, Shape>);

    const connector = toolOf(instance, 'connector');
    connector.onPointerDown?.(pointerEventFactory(60, 40), instance.getState());

    // The rubber-band is a real transient connector: ephemeral, never history.
    connector.onPointerMove?.(pointerEventFactory(250, 40), instance.getState());
    const transient = Object.values(instance.getState().shapes).find(
      (s) => s.type === 'connector',
    );
    expect(transient?.meta).toEqual({ ephemeral: true });
    expect(transient?.['freeEnd']).toEqual({ x: 250, y: 40 });

    connector.onPointerUp?.(pointerEventFactory(460, 40), instance.getState());
    expect(createEdge).toHaveBeenCalledWith(`key-${a.id}`, `key-${b.id}`);
    // Transient cleaned up; nothing entered history.
    expect(
      Object.values(instance.getState().shapes).some((s) => s.type === 'connector'),
    ).toBe(false);
    expect(instance.getState().history.stack).toHaveLength(0);
  });

  test('release on empty space (or the source itself) creates nothing', () => {
    const instance = whiteboardInstance();
    instance.shapeUtils.register(connectable('node'));
    const createEdge = vi.fn();
    instance.host = { createEdge };
    const a = shapeFactory({ type: 'node', x: 0, y: 0, width: 120, height: 80 });
    instance.getState()._setShapesRaw({ [a.id]: a } as Record<ShapeId, Shape>);

    const connector = toolOf(instance, 'connector');
    connector.onPointerDown?.(pointerEventFactory(60, 40), instance.getState());
    connector.onPointerUp?.(pointerEventFactory(600, 400), instance.getState());
    expect(createEdge).not.toHaveBeenCalled();
    expect(Object.keys(instance.getState().shapes)).toHaveLength(1);
  });

  test('legacy enterprise kinds connect without capabilities, keyed by slug', () => {
    const instance = whiteboardInstance();
    // Bare util under the legacy type name — no isConnectable/connectorKey.
    instance.shapeUtils.register({
      type: 'c4node',
      defaultProps: (p) => ({ type: 'c4node', x: p.x, y: p.y, width: 300, height: 110 }),
      getBounds: (s) => ({ x: s.x, y: s.y, width: s.width, height: s.height }),
      hitTest: () => true,
      canResize: () => false,
      canEditText: () => false,
      Component: () => null,
    });
    const createEdge = vi.fn();
    instance.host = { createEdge };
    const a = shapeFactory({ type: 'c4node', x: 0, y: 0, width: 300, height: 110 });
    const b = shapeFactory({ type: 'c4node', x: 500, y: 0, width: 300, height: 110 });
    instance.getState()._setShapesRaw({
      [a.id]: { ...a, slug: 'web-app' },
      [b.id]: { ...b, slug: 'api' },
    } as Record<ShapeId, Shape>);

    const connector = toolOf(instance, 'connector');
    connector.onPointerDown?.(pointerEventFactory(100, 50), instance.getState());
    connector.onPointerUp?.(pointerEventFactory(600, 50), instance.getState());
    expect(createEdge).toHaveBeenCalledWith('web-app', 'api');
  });

  test('whiteboard shapes (sticky etc.) are not connectable', () => {
    const instance = whiteboardInstance();
    const createEdge = vi.fn();
    instance.host = { createEdge };
    const note = shapeFactory({ type: 'sticky', x: 0, y: 0, width: 210, height: 150 });
    instance.getState()._setShapesRaw({
      [note.id]: { ...note, text: '', color: 'yellow' },
    } as Record<ShapeId, Shape>);

    const connector = toolOf(instance, 'connector');
    connector.onPointerDown?.(pointerEventFactory(100, 75), instance.getState());
    // No source acquired → no transient connector, no edge on release.
    expect(
      Object.values(instance.getState().shapes).some((s) => s.type === 'connector'),
    ).toBe(false);
    connector.onPointerUp?.(pointerEventFactory(100, 75), instance.getState());
    expect(createEdge).not.toHaveBeenCalled();
  });
});

describe('place tool', () => {
  test('clicks delegate to host.placeNode with the palette pick; no pick = no-op', () => {
    const instance = whiteboardInstance();
    const placeNode = vi.fn();
    instance.host = { placeNode };
    const place = toolOf(instance, 'place');

    place.onPointerDown?.(pointerEventFactory(10, 20), instance.getState());
    expect(placeNode).not.toHaveBeenCalled();

    instance.getState().setPlacementNodeType('database');
    place.onPointerDown?.(pointerEventFactory(10, 20), instance.getState());
    expect(placeNode).toHaveBeenCalledWith('database', { x: 10, y: 20 });
  });
});
