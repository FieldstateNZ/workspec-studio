import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createCanvasStore } from './store.js';
import type { CanvasStoreInstance } from './store.types.js';
import type { Shape, ShapeId } from '../types.js';
import { shapeFactory } from '../test-helpers/factories.js';

function sortedIds(instance: CanvasStoreInstance): ShapeId[] {
  return Object.values(instance.getState().shapes)
    .sort((a, b) => a.index.localeCompare(b.index))
    .map((s) => s.id);
}

function seedShapes(instance: CanvasStoreInstance, shapes: Shape[]): void {
  const record: Record<ShapeId, Shape> = {};
  for (const s of shapes) record[s.id] = s;
  instance.getState()._setShapesRaw(record);
}

describe('createCanvasStore — factory isolation', () => {
  test('two instances share nothing: shapes, selection, history', () => {
    const a = createCanvasStore();
    const b = createCanvasStore();
    const shape = shapeFactory();

    a.getState().createShape(shape);
    a.getState().select([shape.id]);

    expect(Object.keys(a.getState().shapes)).toHaveLength(1);
    expect(Object.keys(b.getState().shapes)).toHaveLength(0);
    expect(a.getState().selectedIds.has(shape.id)).toBe(true);
    expect(b.getState().selectedIds.size).toBe(0);

    // Undo on b is a no-op AND leaves a untouched.
    b.getState().undo();
    expect(Object.keys(a.getState().shapes)).toHaveLength(1);

    // Undo on a removes its shape; b unaffected either way.
    a.getState().undo();
    expect(Object.keys(a.getState().shapes)).toHaveLength(0);
    expect(b.getState().history.pointer).toBe(-1);
  });

  test('tool and shape-util registries are per-instance', () => {
    const a = createCanvasStore();
    const b = createCanvasStore();
    a.tools.register({ name: 'custom', cursor: 'copy' });
    expect(a.tools.get('custom')).toBeDefined();
    expect(b.tools.get('custom')).toBeUndefined();
    // Both pre-register the select tool independently.
    expect(a.tools.get('select')).toBeDefined();
    expect(b.tools.get('select')).toBeDefined();
    expect(a.tools.get('select')).not.toBe(b.tools.get('select'));
  });

  test('hover stores are per-instance', () => {
    const a = createCanvasStore();
    const b = createCanvasStore();
    a.hover.getState().setHovered('x' as ShapeId);
    expect(a.hover.getState().hoveredId).toBe('x');
    expect(b.hover.getState().hoveredId).toBeNull();
  });
});

describe('shape mutations + history', () => {
  test('create → update → undo → redo round-trips shape state', () => {
    const instance = createCanvasStore();
    const shape = shapeFactory({ x: 10 });
    instance.getState().createShape(shape);
    instance.getState().updateShape(shape.id, { x: 99 });
    expect(instance.getState().shapes[shape.id]?.x).toBe(99);

    instance.getState().undo();
    expect(instance.getState().shapes[shape.id]?.x).toBe(10);
    instance.getState().undo();
    expect(instance.getState().shapes[shape.id]).toBeUndefined();

    instance.getState().redo();
    instance.getState().redo();
    expect(instance.getState().shapes[shape.id]?.x).toBe(99);
  });

  test('executing a new command truncates the redo tail', () => {
    const instance = createCanvasStore();
    const first = shapeFactory();
    const second = shapeFactory();
    instance.getState().createShape(first);
    instance.getState().undo();
    instance.getState().createShape(second);
    // Redo must NOT resurrect `first` — its branch was cut.
    instance.getState().redo();
    expect(instance.getState().shapes[first.id]).toBeUndefined();
    expect(instance.getState().shapes[second.id]).toBeDefined();
    expect(instance.getState().history.stack).toHaveLength(1);
  });

  test('moveShapes and deleteShapes cascade through containment descendants', () => {
    const instance = createCanvasStore();
    const frame = shapeFactory();
    const child = shapeFactory({ containerId: frame.id, x: 5, y: 5 });
    const grandchild = shapeFactory({ containerId: child.id, x: 7, y: 7 });
    const bystander = shapeFactory({ x: 500 });
    seedShapes(instance, [frame, child, grandchild, bystander]);

    instance.getState().moveShapes([frame.id], 10, 20);
    expect(instance.getState().shapes[child.id]?.x).toBe(15);
    expect(instance.getState().shapes[grandchild.id]?.y).toBe(27);
    expect(instance.getState().shapes[bystander.id]?.x).toBe(500);

    instance.getState().select([frame.id]);
    instance.getState().deleteShapes([frame.id]);
    expect(Object.keys(instance.getState().shapes)).toEqual([bystander.id]);
    expect(instance.getState().selectedIds.size).toBe(0);

    // One undo restores the whole subtree (single command per gesture).
    instance.getState().undo();
    expect(Object.keys(instance.getState().shapes)).toHaveLength(4);
  });

  test('_setShapesRaw bypasses history', () => {
    const instance = createCanvasStore();
    const shape = shapeFactory();
    seedShapes(instance, [shape]);
    expect(instance.getState().history.pointer).toBe(-1);
    instance.getState().undo();
    expect(instance.getState().shapes[shape.id]).toBeDefined();
  });

  test('select modes: replace, add, toggle', () => {
    const instance = createCanvasStore();
    const [a, b, c] = [shapeFactory(), shapeFactory(), shapeFactory()];
    seedShapes(instance, [a, b, c]);
    const state = instance.getState();

    state.select([a.id]);
    state.select([b.id], 'add');
    expect(instance.getState().selectedIds).toEqual(new Set([a.id, b.id]));

    state.select([b.id, c.id], 'toggle');
    expect(instance.getState().selectedIds).toEqual(new Set([a.id, c.id]));

    state.select([b.id], 'replace');
    expect(instance.getState().selectedIds).toEqual(new Set([b.id]));
  });
});

describe('CanvasHost fallback contract', () => {
  test('host deleteShapes returning true short-circuits the local delete (no history entry)', () => {
    const hostDelete = vi.fn(() => true);
    const instance = createCanvasStore({ host: { deleteShapes: hostDelete } });
    const shape = shapeFactory();
    seedShapes(instance, [shape]);

    instance.getState().deleteShapes([shape.id]);
    expect(hostDelete).toHaveBeenCalledWith([shape.id]);
    expect(instance.getState().shapes[shape.id]).toBeDefined();
    expect(instance.getState().history.pointer).toBe(-1);
  });

  test('host deleteShapes returning false falls through to the local undoable delete', () => {
    const instance = createCanvasStore({ host: { deleteShapes: () => false } });
    const shape = shapeFactory();
    seedShapes(instance, [shape]);

    instance.getState().deleteShapes([shape.id]);
    expect(instance.getState().shapes[shape.id]).toBeUndefined();
    instance.getState().undo();
    expect(instance.getState().shapes[shape.id]).toBeDefined();
  });

  test('instance.host is swappable after creation (bridge install/clear)', () => {
    const instance = createCanvasStore();
    const shape = shapeFactory();
    seedShapes(instance, [shape]);

    const hostDelete = vi.fn(() => true);
    instance.host = { deleteShapes: hostDelete };
    instance.getState().deleteShapes([shape.id]);
    expect(hostDelete).toHaveBeenCalledTimes(1);
    expect(instance.getState().shapes[shape.id]).toBeDefined();

    instance.host = {};
    instance.getState().deleteShapes([shape.id]);
    expect(instance.getState().shapes[shape.id]).toBeUndefined();
  });
});

describe('z-order actions', () => {
  test('bringToFront / sendToBack reorder and undo restores', () => {
    const instance = createCanvasStore();
    const [a, b, c] = [shapeFactory(), shapeFactory(), shapeFactory()];
    seedShapes(instance, [a, b, c]);
    expect(sortedIds(instance)).toEqual([a.id, b.id, c.id]);

    instance.getState().bringToFront([a.id]);
    expect(sortedIds(instance)).toEqual([b.id, c.id, a.id]);

    instance.getState().sendToBack([c.id]);
    expect(sortedIds(instance)).toEqual([c.id, b.id, a.id]);

    instance.getState().undo();
    expect(sortedIds(instance)).toEqual([b.id, c.id, a.id]);
    instance.getState().undo();
    expect(sortedIds(instance)).toEqual([a.id, b.id, c.id]);
  });

  test('bringForward hops exactly one non-selected blocker; no-op at the top', () => {
    const instance = createCanvasStore();
    const [a, b, c] = [shapeFactory(), shapeFactory(), shapeFactory()];
    seedShapes(instance, [a, b, c]);

    instance.getState().bringForward([a.id]);
    expect(sortedIds(instance)).toEqual([b.id, a.id, c.id]);

    instance.getState().bringForward([a.id]);
    expect(sortedIds(instance)).toEqual([b.id, c.id, a.id]);

    const historyBefore = instance.getState().history.stack.length;
    instance.getState().bringForward([a.id]);
    expect(sortedIds(instance)).toEqual([b.id, c.id, a.id]);
    // Frontmost selection is a true no-op: nothing added to history.
    expect(instance.getState().history.stack).toHaveLength(historyBefore);
  });

  test('sendBackward hops exactly one non-selected blocker; no-op at the bottom', () => {
    const instance = createCanvasStore();
    const [a, b, c] = [shapeFactory(), shapeFactory(), shapeFactory()];
    seedShapes(instance, [a, b, c]);

    instance.getState().sendBackward([c.id]);
    expect(sortedIds(instance)).toEqual([a.id, c.id, b.id]);

    instance.getState().sendBackward([c.id]);
    expect(sortedIds(instance)).toEqual([c.id, a.id, b.id]);

    const historyBefore = instance.getState().history.stack.length;
    instance.getState().sendBackward([c.id]);
    expect(instance.getState().history.stack).toHaveLength(historyBefore);
  });

  test('multi-select bringToFront preserves the selection’s relative order', () => {
    const instance = createCanvasStore();
    const [a, b, c, d] = [shapeFactory(), shapeFactory(), shapeFactory(), shapeFactory()];
    seedShapes(instance, [a, b, c, d]);
    instance.getState().bringToFront([a.id, c.id]);
    expect(sortedIds(instance)).toEqual([b.id, d.id, a.id, c.id]);
  });
});

describe('grouping', () => {
  test('groupShapes assigns one shared groupId; ungroup + undo restore prior state', () => {
    const instance = createCanvasStore();
    const a = shapeFactory({ groupId: 'old-group' });
    const b = shapeFactory();
    seedShapes(instance, [a, b]);

    instance.getState().groupShapes([a.id, b.id]);
    const groupId = instance.getState().shapes[a.id]?.groupId;
    expect(groupId).toBeDefined();
    expect(instance.getState().shapes[b.id]?.groupId).toBe(groupId);

    instance.getState().undo();
    expect(instance.getState().shapes[a.id]?.groupId).toBe('old-group');
    expect(instance.getState().shapes[b.id]?.groupId).toBeUndefined();

    instance.getState().redo();
    instance.getState().ungroupShapes([a.id, b.id]);
    expect(instance.getState().shapes[a.id]?.groupId).toBeUndefined();
    instance.getState().undo();
    expect(instance.getState().shapes[a.id]?.groupId).toBe(groupId);
  });
});

describe('overlay state timers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test('setLens flips isLensSwitching for exactly 280ms', () => {
    const instance = createCanvasStore();
    instance.getState().setLens('structured');
    expect(instance.getState().lens).toBe('structured');
    expect(instance.getState().isLensSwitching).toBe(true);
    vi.advanceTimersByTime(279);
    expect(instance.getState().isLensSwitching).toBe(true);
    vi.advanceTimersByTime(1);
    expect(instance.getState().isLensSwitching).toBe(false);
  });

  test('highlight and markRecent auto-clear after their durations', () => {
    const instance = createCanvasStore();
    const id = 'h1' as ShapeId;
    instance.getState().highlight([id], 1000);
    instance.getState().markRecent([id], 500);
    expect(instance.getState().highlightIds.has(id)).toBe(true);
    expect(instance.getState().recentIds.has(id)).toBe(true);

    vi.advanceTimersByTime(500);
    expect(instance.getState().recentIds.has(id)).toBe(false);
    expect(instance.getState().highlightIds.has(id)).toBe(true);
    vi.advanceTimersByTime(500);
    expect(instance.getState().highlightIds.has(id)).toBe(false);
  });

  test('dispose cancels pending effect timers', () => {
    const instance = createCanvasStore();
    const id = 'h2' as ShapeId;
    instance.getState().highlight([id], 1000);
    instance.dispose();
    vi.advanceTimersByTime(2000);
    // Timer cancelled: the id stays (the instance is dead, state frozen).
    expect(instance.getState().highlightIds.has(id)).toBe(true);
  });

  test('dispose cancels the pending lens-switch timer', () => {
    const instance = createCanvasStore();
    instance.getState().setLens('structured');
    expect(instance.getState().isLensSwitching).toBe(true);
    instance.dispose();
    vi.advanceTimersByTime(1000);
    // Clear callback cancelled: the flag never flips back on a dead instance.
    expect(instance.getState().isLensSwitching).toBe(true);
  });
});

describe('alignDistribute', () => {
  test('brackets the command in a drag transition (isDragging pulse) and is one undo step', () => {
    const instance = createCanvasStore();
    const a = shapeFactory({ x: 0, y: 0 });
    const b = shapeFactory({ x: 3, y: 200 });
    seedShapes(instance, [a, b]);

    const draggingSeen: boolean[] = [];
    const unsubscribe = instance.subscribe((s) => draggingSeen.push(s.isDragging));

    instance.getState().alignDistribute([a.id, b.id]);
    unsubscribe();

    expect(draggingSeen).toContain(true);
    expect(instance.getState().isDragging).toBe(false);
    // Left-aligned into one column.
    expect(instance.getState().shapes[b.id]?.x).toBe(0);

    instance.getState().undo();
    expect(instance.getState().shapes[b.id]?.x).toBe(3);
  });
});

describe('snapshots', () => {
  test('exportSnapshot excludes meta.ephemeral shapes; loadSnapshot resets history + selection', () => {
    const instance = createCanvasStore();
    const durable = shapeFactory();
    const ephemeral = shapeFactory({ meta: { ephemeral: true } });
    seedShapes(instance, [durable, ephemeral]);

    const snap = instance.getState().exportSnapshot();
    expect(snap.version).toBe(1);
    expect(Object.keys(snap.shapes)).toEqual([durable.id]);

    const other = createCanvasStore();
    other.getState().createShape(shapeFactory());
    other.getState().select([...Object.keys(other.getState().shapes)] as ShapeId[]);
    other.getState().loadSnapshot(snap);
    expect(Object.keys(other.getState().shapes)).toEqual([durable.id]);
    expect(other.getState().selectedIds.size).toBe(0);
    expect(other.getState().history.pointer).toBe(-1);
  });
});

describe('persistence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  test('OFF by default: mutations never write localStorage', () => {
    const instance = createCanvasStore();
    instance.getState().createShape(shapeFactory());
    vi.advanceTimersByTime(5000);
    expect(localStorage.length).toBe(0);
    instance.dispose();
  });

  test('with persistenceKey: debounced 800ms write, ephemeral filtered', () => {
    const instance = createCanvasStore({ persistenceKey: 'canvas-test-a' });
    instance.getState().createShape(shapeFactory());
    instance.getState().createShape(shapeFactory({ meta: { ephemeral: true } }));

    vi.advanceTimersByTime(799);
    expect(localStorage.getItem('canvas-test-a')).toBeNull();
    vi.advanceTimersByTime(1);
    const raw = localStorage.getItem('canvas-test-a');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw ?? '{}') as { shapes: Record<string, unknown> };
    expect(Object.keys(parsed.shapes)).toHaveLength(1);
    instance.dispose();
  });

  test('a fresh instance restores camera + shapes from its key', () => {
    const first = createCanvasStore({ persistenceKey: 'canvas-test-b' });
    const shape = shapeFactory({ x: 42 });
    first.getState().createShape(shape);
    first.getState().setCamera({ x: 7, y: 8, zoom: 2 });
    vi.advanceTimersByTime(800);
    first.dispose();

    const second = createCanvasStore({ persistenceKey: 'canvas-test-b' });
    expect(second.getState().shapes[shape.id]?.x).toBe(42);
    expect(second.getState().camera).toEqual({ x: 7, y: 8, zoom: 2 });
    second.dispose();
  });

  test('malformed JSON in storage falls back to defaults', () => {
    localStorage.setItem('canvas-test-b', 'not json {');
    const instance = createCanvasStore({ persistenceKey: 'canvas-test-b' });
    expect(instance.getState().camera).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(Object.keys(instance.getState().shapes)).toHaveLength(0);
    instance.dispose();
  });

  test('VALID JSON that fails the snapshot schema is rejected by the zod gate', () => {
    // Parses fine — dies only in schema validation (camera.x is a string,
    // one shape is missing its index). This is the case that fails if the
    // zod gate is deleted and only JSON.parse's try/catch remains.
    localStorage.setItem(
      'canvas-test-b',
      JSON.stringify({
        version: 1,
        camera: { x: 'nope', y: 0, zoom: 1 },
        shapes: { bad: { id: 'bad', type: 'box', x: 0, y: 0, width: 10, height: 10 } },
      }),
    );
    const instance = createCanvasStore({ persistenceKey: 'canvas-test-b' });
    expect(instance.getState().camera).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(Object.keys(instance.getState().shapes)).toHaveLength(0);
    instance.dispose();

    // Wrong version literal: also schema-rejected.
    localStorage.setItem(
      'canvas-test-b',
      JSON.stringify({ version: 2, camera: { x: 0, y: 0, zoom: 1 }, shapes: {} }),
    );
    const versioned = createCanvasStore({ persistenceKey: 'canvas-test-b' });
    expect(versioned.getState().camera).toEqual({ x: 0, y: 0, zoom: 1 });
    versioned.dispose();
  });

  test('instances with different keys do not cross-contaminate', () => {
    const a = createCanvasStore({ persistenceKey: 'canvas-test-c' });
    const b = createCanvasStore({ persistenceKey: 'canvas-test-d' });
    const aShape = shapeFactory();
    a.getState().createShape(aShape);
    vi.advanceTimersByTime(800);

    // a's key holds exactly a's shape; b's key was never written at all.
    const aRaw = localStorage.getItem('canvas-test-c');
    expect(aRaw).not.toBeNull();
    expect(Object.keys((JSON.parse(aRaw ?? '') as { shapes: object }).shapes)).toEqual([
      aShape.id,
    ]);
    expect(localStorage.getItem('canvas-test-d')).toBeNull();

    // And the reverse: b's write must not leak a's content or key.
    const bShape = shapeFactory();
    b.getState().createShape(bShape);
    vi.advanceTimersByTime(800);
    const bRaw = localStorage.getItem('canvas-test-d');
    expect(bRaw).not.toBeNull();
    expect(Object.keys((JSON.parse(bRaw ?? '') as { shapes: object }).shapes)).toEqual([
      bShape.id,
    ]);
    expect(Object.keys((JSON.parse(localStorage.getItem('canvas-test-c') ?? '') as { shapes: object }).shapes)).toEqual([aShape.id]);
    a.dispose();
    b.dispose();
  });

  test('dispose cancels a PENDING debounced save', () => {
    const instance = createCanvasStore({ persistenceKey: 'canvas-test-e' });
    instance.getState().createShape(shapeFactory());
    instance.dispose();
    vi.advanceTimersByTime(800);
    expect(localStorage.getItem('canvas-test-e')).toBeNull();
  });

  test('dispose unsubscribes persistence: mutations AFTER dispose never schedule saves', () => {
    const instance = createCanvasStore({ persistenceKey: 'canvas-test-f' });
    instance.dispose();
    instance.getState().createShape(shapeFactory());
    vi.advanceTimersByTime(800);
    expect(localStorage.getItem('canvas-test-f')).toBeNull();
  });
});
