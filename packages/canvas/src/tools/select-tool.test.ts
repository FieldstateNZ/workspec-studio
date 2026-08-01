import { describe, expect, test } from 'vitest';
import { createCanvasStore } from '../store/store.js';
import type { CanvasStoreInstance } from '../store/store.types.js';
import type { Shape, ShapeId } from '../types.js';
import {
  boxShapeUtilFactory,
  pointerEventFactory,
  shapeFactory,
} from '../test-helpers/factories.js';

function setup(shapes: Shape[]): CanvasStoreInstance {
  const instance = createCanvasStore();
  instance.shapeUtils.register(boxShapeUtilFactory());
  const record: Record<ShapeId, Shape> = {};
  for (const s of shapes) record[s.id] = s;
  instance.getState()._setShapesRaw(record);
  return instance;
}

/** The instance's own pre-registered select tool (never undefined after createCanvasStore). */
function selectToolOf(instance: CanvasStoreInstance) {
  const tool = instance.tools.get('select');
  if (!tool) throw new Error('select tool missing');
  return tool;
}

describe('select tool — selection', () => {
  test('click on a shape selects it; click on empty clears', () => {
    const shape = shapeFactory({ x: 0, y: 0, width: 100, height: 60 });
    const instance = setup([shape]);
    const tool = selectToolOf(instance);

    tool.onPointerDown?.(pointerEventFactory(50, 30), instance.getState());
    tool.onPointerUp?.(pointerEventFactory(50, 30), instance.getState());
    expect(instance.getState().selectedIds).toEqual(new Set([shape.id]));

    tool.onPointerDown?.(pointerEventFactory(400, 400), instance.getState());
    tool.onPointerUp?.(pointerEventFactory(400, 400), instance.getState());
    expect(instance.getState().selectedIds.size).toBe(0);
  });

  test('shift-click toggles shapes into and out of the selection', () => {
    const a = shapeFactory({ x: 0, y: 0 });
    const b = shapeFactory({ x: 200, y: 0 });
    const instance = setup([a, b]);
    const tool = selectToolOf(instance);

    tool.onPointerDown?.(pointerEventFactory(10, 10), instance.getState());
    tool.onPointerUp?.(pointerEventFactory(10, 10), instance.getState());
    tool.onPointerDown?.(pointerEventFactory(210, 10, { shiftKey: true }), instance.getState());
    tool.onPointerUp?.(pointerEventFactory(210, 10, { shiftKey: true }), instance.getState());
    expect(instance.getState().selectedIds).toEqual(new Set([a.id, b.id]));

    tool.onPointerDown?.(pointerEventFactory(210, 10, { shiftKey: true }), instance.getState());
    tool.onPointerUp?.(pointerEventFactory(210, 10, { shiftKey: true }), instance.getState());
    expect(instance.getState().selectedIds).toEqual(new Set([a.id]));
  });

  test('clicking a group member selects the whole group', () => {
    const a = shapeFactory({ x: 0, y: 0, groupId: 'g1' });
    const b = shapeFactory({ x: 300, y: 300, groupId: 'g1' });
    const instance = setup([a, b]);
    const tool = selectToolOf(instance);

    tool.onPointerDown?.(pointerEventFactory(10, 10), instance.getState());
    expect(instance.getState().selectedIds).toEqual(new Set([a.id, b.id]));
  });

  test('click on OVERLAPPING shapes selects the topmost; z-order change redirects the hit', () => {
    // Both shapes cover the click point — the consumer-path pin for
    // hitTestTopmost's front-to-back ordering (selection is where a
    // reversed ordering would actually bite users).
    const bottom = shapeFactory({ x: 0, y: 0, width: 100, height: 60 });
    const top = shapeFactory({ x: 0, y: 0, width: 100, height: 60 });
    const instance = setup([bottom, top]);
    const tool = selectToolOf(instance);

    tool.onPointerDown?.(pointerEventFactory(50, 30), instance.getState());
    tool.onPointerUp?.(pointerEventFactory(50, 30), instance.getState());
    expect(instance.getState().selectedIds).toEqual(new Set([top.id]));

    // Send the topmost to the back; the same click must now hit the other.
    instance.getState().sendToBack([top.id]);
    instance.getState().clearSelection();
    tool.onPointerDown?.(pointerEventFactory(50, 30), instance.getState());
    tool.onPointerUp?.(pointerEventFactory(50, 30), instance.getState());
    expect(instance.getState().selectedIds).toEqual(new Set([bottom.id]));
  });

  test('marquee selects intersecting shapes only', () => {
    const inside = shapeFactory({ x: 100, y: 100, width: 50, height: 50 });
    const outside = shapeFactory({ x: 1000, y: 1000, width: 50, height: 50 });
    const instance = setup([inside, outside]);
    const tool = selectToolOf(instance);

    tool.onPointerDown?.(pointerEventFactory(50, 50), instance.getState());
    tool.onPointerMove?.(pointerEventFactory(300, 300), instance.getState());
    expect(instance.getState().marquee).not.toBeNull();
    tool.onPointerUp?.(pointerEventFactory(300, 300), instance.getState());

    expect(instance.getState().selectedIds).toEqual(new Set([inside.id]));
    expect(instance.getState().marquee).toBeNull();
  });
});

describe('select tool — drag gesture', () => {
  test('a drag live-writes positions and commits exactly ONE undoable command', () => {
    const shape = shapeFactory({ x: 0, y: 0, width: 100, height: 60 });
    const instance = setup([shape]);
    const tool = selectToolOf(instance);

    tool.onPointerDown?.(pointerEventFactory(50, 30), instance.getState());
    tool.onPointerMove?.(pointerEventFactory(58, 30), instance.getState());
    // Live write, no history yet.
    expect(instance.getState().shapes[shape.id]?.x).toBe(8);
    expect(instance.getState().history.stack).toHaveLength(0);
    expect(instance.getState().isDragging).toBe(true);

    tool.onPointerMove?.(pointerEventFactory(80, 45), instance.getState());
    tool.onPointerUp?.(pointerEventFactory(80, 45), instance.getState());
    expect(instance.getState().shapes[shape.id]).toMatchObject({ x: 30, y: 15 });
    expect(instance.getState().history.stack).toHaveLength(1);
    expect(instance.getState().isDragging).toBe(false);

    // One undo restores the whole gesture.
    instance.getState().undo();
    expect(instance.getState().shapes[shape.id]).toMatchObject({ x: 0, y: 0 });
  });

  test('sub-threshold movement is a click, not a drag', () => {
    const shape = shapeFactory({ x: 0, y: 0 });
    const instance = setup([shape]);
    const tool = selectToolOf(instance);

    tool.onPointerDown?.(pointerEventFactory(50, 30), instance.getState());
    tool.onPointerMove?.(pointerEventFactory(52, 31), instance.getState());
    tool.onPointerUp?.(pointerEventFactory(52, 31), instance.getState());
    expect(instance.getState().shapes[shape.id]?.x).toBe(0);
    expect(instance.getState().history.stack).toHaveLength(0);
  });

  test('in structured lens, dragging writes lensOffset and leaves x/y untouched', () => {
    const shape = shapeFactory({ x: 0, y: 0 });
    const instance = setup([shape]);
    instance.getState().setLens('structured');
    const tool = selectToolOf(instance);

    tool.onPointerDown?.(pointerEventFactory(50, 30), instance.getState());
    tool.onPointerMove?.(pointerEventFactory(70, 30), instance.getState());
    tool.onPointerUp?.(pointerEventFactory(70, 30), instance.getState());

    const moved = instance.getState().shapes[shape.id];
    expect(moved?.x).toBe(0);
    expect(moved?.lensOffset).toEqual({ dx: 20, dy: 0 });

    // Undo restores "no offset at all" — the exact original state.
    instance.getState().undo();
    expect(instance.getState().shapes[shape.id]?.lensOffset).toBeUndefined();
  });

  test('dragging a container carries its containment descendants', () => {
    const frame = shapeFactory({ x: 0, y: 0, width: 100, height: 60 });
    // Child sits OUTSIDE the frame's rect so the click unambiguously hits the frame.
    const child = shapeFactory({ x: 150, y: 150, containerId: frame.id });
    const instance = setup([frame, child]);
    const tool = selectToolOf(instance);

    tool.onPointerDown?.(pointerEventFactory(50, 30), instance.getState());
    tool.onPointerMove?.(pointerEventFactory(70, 30), instance.getState());
    tool.onPointerUp?.(pointerEventFactory(70, 30), instance.getState());

    expect(instance.getState().shapes[frame.id]?.x).toBe(20);
    expect(instance.getState().shapes[child.id]?.x).toBe(170);
  });
});

describe('select tool — editing + deletion', () => {
  test('double-click enters editing when the util allows text editing', () => {
    const editable = shapeFactory({ x: 0, y: 0 });
    const instance = createCanvasStore();
    instance.shapeUtils.register(boxShapeUtilFactory({ canEditText: () => true }));
    instance.getState()._setShapesRaw({ [editable.id]: editable });
    const tool = selectToolOf(instance);

    tool.onDoubleClick?.(pointerEventFactory(10, 10), instance.getState());
    expect(instance.getState().editingId).toBe(editable.id);
    expect(instance.getState().selectedIds).toEqual(new Set([editable.id]));
  });

  test('double-click does nothing when canEditText is false', () => {
    const shape = shapeFactory({ x: 0, y: 0 });
    const instance = setup([shape]);
    const tool = selectToolOf(instance);
    tool.onDoubleClick?.(pointerEventFactory(10, 10), instance.getState());
    expect(instance.getState().editingId).toBeNull();
  });

  test('Delete key removes the selection unless editing', () => {
    const shape = shapeFactory({ x: 0, y: 0 });
    const instance = setup([shape]);
    const tool = selectToolOf(instance);
    instance.getState().select([shape.id]);

    instance.getState().setEditing(shape.id);
    tool.onKeyDown?.(new KeyboardEvent('keydown', { key: 'Delete' }), instance.getState());
    expect(instance.getState().shapes[shape.id]).toBeDefined();

    instance.getState().setEditing(null);
    tool.onKeyDown?.(new KeyboardEvent('keydown', { key: 'Delete' }), instance.getState());
    expect(instance.getState().shapes[shape.id]).toBeUndefined();
  });
});
