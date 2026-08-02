import { useRef, useEffect, type KeyboardEvent, type RefObject } from 'react';
import { useCanvasStore } from '../canvas-provider.js';
import type { ShapeId } from '../types.js';

/**
 * Shared contentEditable plumbing for text-editing shape components: when
 * the shape becomes the store's `editingId`, the returned ref's element is
 * focused with the caret placed at the end; blur exits editing, Escape
 * blurs (and stops propagation so canvas shortcuts don't also fire).
 */
export function useTextEditing(shapeId: ShapeId | null): {
  textRef: RefObject<HTMLDivElement | null>;
  onBlur: () => void;
  onKeyDown: (e: KeyboardEvent) => void;
  isEditing: boolean;
} {
  const textRef = useRef<HTMLDivElement>(null);
  const setEditing = useCanvasStore((s) => s.setEditing);
  const editingId = useCanvasStore((s) => s.editingId);
  const isEditing = editingId === shapeId;

  useEffect(() => {
    if (!isEditing || !textRef.current) return;
    const el = textRef.current;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }, [isEditing]);

  const onBlur = (): void => {
    setEditing(null);
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      textRef.current?.blur();
    }
    e.stopPropagation();
  };

  return { textRef, onBlur, onKeyDown, isEditing };
}
