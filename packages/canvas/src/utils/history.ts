import type { HistoryStack, Command, Shape, ShapeId } from '../types.js';

/** A fresh, empty undo/redo stack. */
export const createHistory = (): HistoryStack => ({ stack: [], pointer: -1 });

/**
 * Apply `cmd` and push it onto the stack, truncating any redo tail beyond
 * the current pointer (the standard command-pattern branch cut).
 */
export function executeCommand(
  history: HistoryStack,
  shapes: Record<ShapeId, Shape>,
  cmd: Command,
): { history: HistoryStack; shapes: Record<ShapeId, Shape> } {
  const newShapes = cmd.do(shapes);
  const newStack = [...history.stack.slice(0, history.pointer + 1), cmd];
  return {
    history: { stack: newStack, pointer: newStack.length - 1 },
    shapes: newShapes,
  };
}

/** Step the pointer back one command, applying its `undo`. No-op at the bottom of the stack. */
export function undoCommand(
  history: HistoryStack,
  shapes: Record<ShapeId, Shape>,
): { history: HistoryStack; shapes: Record<ShapeId, Shape> } {
  if (history.pointer < 0) return { history, shapes };
  const cmd = history.stack[history.pointer];
  if (!cmd) return { history, shapes };
  return {
    history: { ...history, pointer: history.pointer - 1 },
    shapes: cmd.undo(shapes),
  };
}

/** Step the pointer forward one command, re-applying its `do`. No-op at the top of the stack. */
export function redoCommand(
  history: HistoryStack,
  shapes: Record<ShapeId, Shape>,
): { history: HistoryStack; shapes: Record<ShapeId, Shape> } {
  if (history.pointer >= history.stack.length - 1) return { history, shapes };
  const newPointer = history.pointer + 1;
  const cmd = history.stack[newPointer];
  if (!cmd) return { history, shapes };
  return {
    history: { ...history, pointer: newPointer },
    shapes: cmd.do(shapes),
  };
}
