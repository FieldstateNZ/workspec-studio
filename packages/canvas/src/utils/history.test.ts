import { describe, expect, test } from 'vitest';
import { createHistory, executeCommand, redoCommand, undoCommand } from './history.js';
import type { Command, Shape, ShapeId } from '../types.js';
import { shapeFactory } from '../test-helpers/factories.js';

function setX(shape: Shape, x: number): Command {
  return {
    label: `x=${String(x)}`,
    do: (shapes) => ({ ...shapes, [shape.id]: { ...shape, x } }),
    undo: (shapes) => ({ ...shapes, [shape.id]: shape }),
  };
}

describe('history command stack', () => {
  test('undo/redo walk the pointer; no-ops at both ends', () => {
    const shape = shapeFactory({ x: 0 });
    let shapes: Record<ShapeId, Shape> = { [shape.id]: shape };
    let history = createHistory();

    ({ history, shapes } = executeCommand(history, shapes, setX(shape, 10)));
    expect(shapes[shape.id]?.x).toBe(10);
    expect(history.pointer).toBe(0);

    ({ history, shapes } = undoCommand(history, shapes));
    expect(shapes[shape.id]?.x).toBe(0);
    expect(history.pointer).toBe(-1);

    // Underflow: unchanged.
    const underflow = undoCommand(history, shapes);
    expect(underflow.history).toBe(history);
    expect(underflow.shapes).toBe(shapes);

    ({ history, shapes } = redoCommand(history, shapes));
    expect(shapes[shape.id]?.x).toBe(10);

    // Overflow: unchanged.
    const overflow = redoCommand(history, shapes);
    expect(overflow.history).toBe(history);
  });

  test('executing after undo truncates the redo tail', () => {
    const shape = shapeFactory({ x: 0 });
    let shapes: Record<ShapeId, Shape> = { [shape.id]: shape };
    let history = createHistory();

    ({ history, shapes } = executeCommand(history, shapes, setX(shape, 10)));
    ({ history, shapes } = executeCommand(history, shapes, setX(shape, 20)));
    ({ history, shapes } = undoCommand(history, shapes));
    ({ history, shapes } = executeCommand(history, shapes, setX(shape, 30)));

    expect(history.stack).toHaveLength(2);
    expect(history.stack.map((c) => c.label)).toEqual(['x=10', 'x=30']);
    // Redo has nothing to replay — the x=20 branch is gone.
    const after = redoCommand(history, shapes);
    expect(after.shapes[shape.id]?.x).toBe(30);
  });
});
