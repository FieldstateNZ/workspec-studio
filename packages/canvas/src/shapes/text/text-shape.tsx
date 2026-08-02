import { useLayoutEffect, useRef, type FC, type KeyboardEvent } from 'react';
import type { TextShape } from '../../shape-types.js';
import { useCanvasStore } from '../../canvas-provider.js';

// Ported from the enterprise TextShape.tsx; store access goes through the
// provider hooks instead of the module singleton (#117/#118).

interface Props {
  shape: TextShape;
  isEditing: boolean;
}

const TextEditor: FC<{
  shape: TextShape;
  onBlur: (text: string) => void;
}> = ({ shape, onBlur }) => {
  const divRef = useRef<HTMLDivElement>(null);
  const wLocked = shape.lockWidth === true;

  useLayoutEffect(() => {
    const el = divRef.current;
    if (!el) return;
    el.innerText = shape.text;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(range);
    }
    // Mount-only on purpose (enterprise semantics): the editor seeds its
    // content once and stays uncontrolled until commit.
  }, []);

  const handleBlur = (): void => {
    onBlur(divRef.current?.innerText ?? '');
  };

  const handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      divRef.current?.blur();
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      divRef.current?.blur();
    }
    e.stopPropagation();
  };

  return (
    <div
      ref={divRef}
      contentEditable
      suppressContentEditableWarning
      dangerouslySetInnerHTML={{ __html: '' }}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      style={{
        fontSize: shape.fontSize,
        fontWeight: shape.fontWeight,
        fontFamily: shape.fontFamily ?? 'var(--sans)',
        color: shape.color ?? 'var(--ink)',
        outline: 'none',
        padding: 0,
        margin: 0,
        minWidth: 2,
        minHeight: Math.ceil(shape.fontSize * 1.5),
        whiteSpace: wLocked ? 'pre-wrap' : 'pre',
        wordBreak: wLocked ? 'break-word' : 'normal',
        cursor: 'text',
        borderBottom: '1px solid var(--accent)',
      }}
    />
  );
};

export const TextShapeComponent: FC<Props> = ({ shape, isEditing }) => {
  const updateShape = useCanvasStore((s) => s.updateShape);
  const deleteShapes = useCanvasStore((s) => s.deleteShapes);
  const setEditing = useCanvasStore((s) => s.setEditing);

  const outerRef = useRef<HTMLDivElement>(null);
  const prevMeasureKey = useRef('');

  const wLocked = shape.lockWidth === true;
  const hLocked = shape.lockHeight === true;

  useLayoutEffect(() => {
    if (isEditing || (wLocked && hLocked)) return;
    const el = outerRef.current;
    if (!el) return;

    const key = `${shape.text}|${String(shape.fontSize)}|${shape.fontFamily ?? ''}|${String(shape.fontWeight)}|${String(shape.width)}|${String(shape.height)}|${String(wLocked)}|${String(hLocked)}`;
    if (key === prevMeasureKey.current) return;
    prevMeasureKey.current = key;

    const patch: Partial<TextShape> = {};

    if (!wLocked) {
      // Rendered with width:fit-content so offsetWidth is the natural text width.
      const w = Math.max(20, el.offsetWidth);
      if (Math.abs(w - shape.width) > 1) patch.width = w;
    }
    if (!hLocked) {
      // scrollHeight gives content height regardless of overflow:hidden.
      const h = Math.max(Math.ceil(shape.fontSize * 1.5), el.scrollHeight);
      if (Math.abs(h - shape.height) > 1) patch.height = h;
    }

    if (Object.keys(patch).length > 0) {
      updateShape(shape.id, patch);
    }
  }, [
    isEditing,
    wLocked,
    hLocked,
    shape.text,
    shape.fontSize,
    shape.fontFamily,
    shape.fontWeight,
    shape.width,
    shape.height,
    shape.id,
    updateShape,
  ]);

  const handleBlur = (text: string): void => {
    if (!text.trim()) {
      deleteShapes([shape.id]);
    } else if (text !== shape.text) {
      updateShape(shape.id, { text });
    }
    setEditing(null);
  };

  const displayText = shape.text || null;
  const placeholderText = 'Text...';

  return (
    <div
      ref={outerRef}
      style={{
        width: wLocked ? shape.width : 'fit-content',
        height: hLocked ? shape.height : 'auto',
        minWidth: 20,
        minHeight: Math.ceil(shape.fontSize * 1.5),
        overflow: wLocked && hLocked ? 'hidden' : 'visible',
        display: 'inline-block',
        padding: 0,
        margin: 0,
        userSelect: isEditing ? 'text' : 'none',
      }}
    >
      {isEditing ? (
        <TextEditor shape={shape} onBlur={handleBlur} />
      ) : displayText ? (
        <span
          style={{
            fontSize: shape.fontSize,
            fontWeight: shape.fontWeight,
            fontFamily: shape.fontFamily ?? 'var(--sans)',
            color: shape.color ?? 'var(--ink)',
            whiteSpace: wLocked ? 'pre-wrap' : 'pre',
            wordBreak: wLocked ? 'break-word' : 'normal',
            display: 'block',
            padding: 0,
            margin: 0,
          }}
        >
          {displayText}
        </span>
      ) : (
        <span
          style={{
            fontSize: shape.fontSize,
            fontWeight: shape.fontWeight,
            fontFamily: shape.fontFamily ?? 'var(--sans)',
            color: 'var(--ink-ghost)',
            whiteSpace: 'pre',
            display: 'block',
            padding: 0,
            margin: 0,
          }}
        >
          {placeholderText}
        </span>
      )}
    </div>
  );
};
