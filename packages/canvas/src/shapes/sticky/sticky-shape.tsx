import { useLayoutEffect, useRef, useState, type FC, type KeyboardEvent, type FocusEvent } from 'react';
import type { StickyNoteType, StickyShape } from '../../shape-types.js';
import { useCanvasStore } from '../../canvas-provider.js';
import {
  NOTE_TYPE_OPTIONS,
  STICKY_COLORS,
  deterministicTilt,
  noteTypeColorVar,
  noteTypeLabel,
  tornClipPath,
} from './sticky-shared.js';
import { StickyChecklist, StickyEyebrow, StickyFooter } from './content-blocks.js';
import { IndexCardBody, PhotoBody, VoiceBody } from './media-notes.js';
import { STICKY_PAPER_SHADOW } from '../../style/shape-defaults.js';

// Ported from the enterprise StickyShape.tsx (#356–#361). Two deviations,
// both S1-scoped exclusions (#117): the Atlas badge / `atlasAuthored`
// treatments are dropped with the atlas family, and store access goes
// through the provider hooks instead of the module singleton.

interface Props {
  shape: StickyShape;
  isEditing: boolean;
}

const PADDING = '13px 13px 11px';

// ── Inline editor (title + body) ──────────────────────────────────────────────

const StickyEditor: FC<{
  shape: StickyShape;
  onCommit: (next: { title: string; text: string }) => void;
}> = ({ shape, onCommit }) => {
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (body) body.innerText = shape.text;
    // Focus the body for quick capture; title is an optional refinement.
    body?.focus();
    if (body) {
      const range = document.createRange();
      range.selectNodeContents(body);
      range.collapse(false);
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
    // Mount-only on purpose (enterprise semantics): the editor seeds its
    // content once and stays uncontrolled until commit.
  }, []);

  const commit = (): void => {
    onCommit({
      title: titleRef.current?.value ?? shape.title ?? '',
      text: bodyRef.current?.innerText ?? '',
    });
  };

  const handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      (e.target as HTMLElement).blur();
    }
    e.stopPropagation();
  };

  // Commit only when focus leaves the whole note, not when moving title↔body.
  const handleBlur = (e: FocusEvent): void => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    commit();
  };

  return (
    <div
      onBlur={handleBlur}
      style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%', height: '100%' }}
    >
      <input
        ref={titleRef}
        defaultValue={shape.title ?? ''}
        placeholder="Title"
        onKeyDown={handleKeyDown}
        style={{
          fontFamily: shape.fontFamily ?? 'var(--sans)',
          fontSize: 13.5,
          fontWeight: 700,
          lineHeight: 1.25,
          color: 'var(--ink)',
          background: 'transparent',
          border: 'none',
          outline: 'none',
          padding: 0,
          width: '100%',
        }}
      />
      <div
        ref={bodyRef}
        contentEditable
        suppressContentEditableWarning
        onKeyDown={handleKeyDown}
        style={{
          fontFamily: shape.fontFamily ?? 'var(--sans)',
          fontSize: 12.5,
          fontWeight: 400,
          lineHeight: 1.25,
          color: 'var(--ink)',
          outline: 'none',
          wordBreak: 'break-word',
          whiteSpace: 'pre-wrap',
          flex: 1,
          overflow: 'hidden',
          cursor: 'text',
        }}
      />
    </div>
  );
};

// ── Structured-lens forms ────────────────────────────────────────────────────

/**
 * Typed artifact card (#360): the structured-lens face of a note that's been
 * promoted to a type. A left rail + eyebrow in the type colour, square (0°),
 * and sitting on bg-elevated — it reads as a governed artifact, not loose
 * paper.
 */
const TypedArtifactCard: FC<{
  shape: StickyShape;
  noteType: StickyNoteType;
  onDemote: () => void;
}> = ({ shape, noteType, onDemote }) => {
  const typeColor = noteTypeColorVar(noteType);
  const hasTitle = !!shape.title && shape.title.length > 0;
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 5,
        padding: '12px 13px',
        background: 'var(--bg-elevated)',
        color: 'var(--ink)',
        border: '1px solid var(--line)',
        borderLeft: `3px solid ${typeColor}`,
        borderRadius: 8,
        boxShadow: 'var(--sh-2)',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
        <span
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: typeColor,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            flex: 1,
          }}
        >
          {noteTypeLabel(noteType)}
        </span>
      </div>
      {hasTitle && (
        <div
          style={{
            fontFamily: shape.fontFamily ?? 'var(--sans)',
            fontSize: 14,
            fontWeight: 700,
            lineHeight: 1.25,
            wordBreak: 'break-word',
          }}
        >
          {shape.title}
        </div>
      )}
      {shape.text && (
        <div
          style={{
            fontFamily: shape.fontFamily ?? 'var(--sans)',
            // No title → the body carries the card, so it takes the title weight.
            fontSize: hasTitle ? 11.5 : 14,
            fontWeight: hasTitle ? 400 : 700,
            lineHeight: 1.25,
            color: hasTitle ? 'var(--ink-soft)' : 'var(--ink)',
            wordBreak: 'break-word',
            whiteSpace: 'pre-wrap',
            overflow: 'hidden',
          }}
        >
          {shape.text}
        </div>
      )}
      <StickyFooter tags={shape.tags} reactions={shape.reactions} author={shape.author} />
      <button
        data-canvas-ui
        type="button"
        title="Make loose again"
        onClick={(e) => {
          e.stopPropagation();
          onDemote();
        }}
        style={{
          position: 'absolute',
          bottom: 6,
          right: 7,
          pointerEvents: 'auto',
          fontFamily: 'var(--mono)',
          fontSize: 8,
          fontWeight: 600,
          letterSpacing: '0.04em',
          color: 'var(--ink-muted)',
          background: 'transparent',
          border: 'none',
          padding: 2,
          cursor: 'pointer',
        }}
      >
        make loose
      </button>
    </div>
  );
};

/**
 * Loose·untyped chip (#361): the structured-lens face of a note that hasn't
 * been typed yet. Dashed boundary + handwriting body keep it reading as a raw
 * thought even on the governed lens; "type it →" promotes it via an inline
 * picker.
 */
const LooseChip: FC<{
  shape: StickyShape;
  onPromote: (noteType: StickyNoteType) => void;
  onSelect: () => void;
}> = ({ shape, onPromote, onSelect }) => {
  const [picking, setPicking] = useState(false);
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: 'var(--bg-elevated)',
        border: '1.5px dashed var(--line-2)',
        borderRadius: 8,
        padding: '10px 11px',
        display: 'flex',
        flexDirection: 'column',
        gap: 5,
        overflow: 'hidden',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 8,
          fontWeight: 700,
          color: 'var(--ink-muted)',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          flexShrink: 0,
        }}
      >
        LOOSE · UNTYPED
      </span>
      <div
        style={{
          fontFamily: "Caveat, 'Comic Sans MS', cursive",
          fontSize: 16,
          fontWeight: 600,
          color: 'var(--ink)',
          flex: 1,
          wordBreak: 'break-word',
          whiteSpace: 'pre-wrap',
          overflow: 'hidden',
        }}
      >
        {shape.title ? `${shape.title} — ${shape.text}` : shape.text}
      </div>
      {picking ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, flexShrink: 0 }}>
          {NOTE_TYPE_OPTIONS.map((opt) => (
            <button
              key={opt}
              data-canvas-ui
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPromote(opt);
              }}
              style={{
                pointerEvents: 'auto',
                fontFamily: 'var(--mono)',
                fontSize: 8.5,
                fontWeight: 600,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                color: noteTypeColorVar(opt),
                background: 'var(--bg-elevated)',
                border: `1px solid ${noteTypeColorVar(opt)}`,
                borderRadius: 5,
                padding: '2px 6px',
                cursor: 'pointer',
              }}
            >
              {noteTypeLabel(opt)}
            </button>
          ))}
        </div>
      ) : (
        <button
          data-canvas-ui
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            // Select first so the promote action lands on this note, then open
            // the inline type picker (the shape-level stand-in for the side
            // panel's promote UI).
            onSelect();
            setPicking(true);
          }}
          style={{
            pointerEvents: 'auto',
            fontSize: 9.5,
            fontWeight: 600,
            color: 'var(--accent)',
            backgroundColor: 'var(--accent-wash)',
            border: '1px solid var(--accent-soft)',
            borderRadius: 5,
            padding: '2px 7px',
            cursor: 'pointer',
            alignSelf: 'flex-start',
            flexShrink: 0,
          }}
        >
          type it →
        </button>
      )}
    </div>
  );
};

// ── Component ─────────────────────────────────────────────────────────────────

export const StickyShapeComponent: FC<Props> = ({ shape, isEditing }) => {
  const updateShape = useCanvasStore((s) => s.updateShape);
  const setEditing = useCanvasStore((s) => s.setEditing);
  const select = useCanvasStore((s) => s.select);
  const lens = useCanvasStore((s) => s.lens);
  const selected = useCanvasStore((s) => s.selectedIds.has(shape.id));
  const isDragging = useCanvasStore((s) => s.isDragging && s.selectedIds.has(shape.id));

  const freeformVisible = lens === 'freeform';
  const tilt = freeformVisible ? deterministicTilt(shape.id) : 0;
  const colors = STICKY_COLORS[shape.color];

  const handleCommit = (next: { title: string; text: string }): void => {
    const patch: Partial<StickyShape> = {};
    const title = next.title.trim();
    if (next.text !== shape.text) patch.text = next.text;
    if (title !== (shape.title ?? '')) patch.title = title || undefined;
    if (Object.keys(patch).length > 0) updateShape(shape.id, patch);
    setEditing(null);
  };

  const toggleChecklistItem = (itemId: string): void => {
    const checklist = shape.checklist?.map((item) =>
      item.id === itemId ? { ...item, done: !item.done } : item,
    );
    if (checklist) updateShape(shape.id, { checklist });
  };

  const hasTitle = !!shape.title && shape.title.length > 0;
  const hasChecklist = !!shape.checklist && shape.checklist.length > 0;

  const patchShape = (patch: Partial<StickyShape>): void => {
    updateShape(shape.id, patch);
  };

  // Promote/demote at the shape level. The deeper "write the artifact + trace
  // link on the build board" is a host follow-up — here we only flip noteType,
  // which is what drives the typed-card vs loose-chip face.
  const handlePromote = (noteType: StickyNoteType): void => {
    select([shape.id], 'replace');
    updateShape(shape.id, { noteType });
  };
  const handleDemote = (): void => {
    updateShape(shape.id, { noteType: undefined });
  };

  // Media notes (index/photo/voice) render one fixed surface across both lenses
  // and never take the freeform tilt — they're analog artefacts that sit flat.
  if (shape.media) {
    const Body =
      shape.media === 'index' ? IndexCardBody : shape.media === 'photo' ? PhotoBody : VoiceBody;
    return (
      <div
        style={{
          position: 'relative',
          width: shape.width,
          height: shape.height,
          borderRadius: 3,
          boxShadow: selected
            ? '0 0 0 2px var(--accent), 0 0 0 7px var(--accent-soft)'
            : undefined,
          animation: 'sticky-materialize 0.3s cubic-bezier(0.2,0.7,0.3,1)',
        }}
      >
        <Body shape={shape} isDragging={isDragging} onPatch={patchShape} />
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: shape.width, height: shape.height }}>
      {/* Freeform: Blueprint paper sticky */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: freeformVisible ? 1 : 0,
          transform: freeformVisible ? `rotate(${String(tilt)}deg)` : `scale(0.94) rotate(0deg)`,
          transition: 'opacity 0.28s ease, transform 0.28s ease',
          pointerEvents: freeformVisible ? undefined : 'none',
        }}
      >
        {/* Frame: carries the drop shadow + selection ring + materialize, OUTSIDE
            the torn clip-path so a torn note's ring/shadow isn't sheared off. */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            borderRadius: 2,
            boxShadow: selected
              ? '0 0 0 2px var(--accent), 0 0 0 7px var(--accent-soft)'
              : STICKY_PAPER_SHADOW,
            animation: 'sticky-materialize 0.3s cubic-bezier(0.2,0.7,0.3,1)',
          }}
        >
          {/* Paper: bg + borders + content; clip-path lives here so only the paper
              tears, never the shadow/ring on the frame above. */}
          <div
            style={{
              position: 'relative',
              width: '100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: 5,
              padding: PADDING,
              background: 'var(--bg-elevated)',
              color: 'var(--ink)',
              border: `1px solid ${colors.edge}`,
              borderLeft: `3px solid ${colors.bg}`,
              borderRadius: 2,
              clipPath: shape.torn ? tornClipPath() : undefined,
              overflow: 'hidden',
              cursor: isDragging ? 'grabbing' : 'grab',
              userSelect: isEditing ? 'text' : 'none',
            }}
          >
            <StickyEyebrow shape={shape} />

            {isEditing ? (
              <StickyEditor shape={shape} onCommit={handleCommit} />
            ) : (
              <>
                {hasTitle && (
                  <div
                    style={{
                      fontFamily: shape.fontFamily ?? 'var(--sans)',
                      fontSize: 13.5,
                      fontWeight: 700,
                      lineHeight: 1.25,
                      wordBreak: 'break-word',
                    }}
                  >
                    {shape.title}
                  </div>
                )}
                {shape.text && (
                  <div
                    style={{
                      fontFamily: shape.fontFamily ?? 'var(--sans)',
                      fontSize: 12.5,
                      fontWeight: 400,
                      lineHeight: 1.25,
                      wordBreak: 'break-word',
                      whiteSpace: 'pre-wrap',
                      overflow: 'hidden',
                    }}
                  >
                    {shape.text}
                  </div>
                )}
                {!shape.text && !hasTitle && !hasChecklist && (
                  <div style={{ fontSize: 12.5, color: 'var(--ink-muted)', opacity: 0.7 }}>
                    Double-click to edit
                  </div>
                )}
                {hasChecklist && shape.checklist && (
                  <StickyChecklist items={shape.checklist} onToggle={toggleChecklistItem} />
                )}
                <StickyFooter tags={shape.tags} reactions={shape.reactions} author={shape.author} />
              </>
            )}
          </div>
        </div>
      </div>

      {/* Structured: typed artifact card (#360) or loose·untyped chip (#361),
          cross-fading with the freeform paper above. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: freeformVisible ? 0 : 1,
          transform: freeformVisible ? 'scale(0.94)' : 'scale(1)',
          transition: 'opacity 0.28s ease, transform 0.28s ease',
          pointerEvents: freeformVisible ? 'none' : undefined,
          boxShadow: selected
            ? '0 0 0 2px var(--accent), 0 0 0 7px var(--accent-soft)'
            : undefined,
          borderRadius: 8,
        }}
      >
        {shape.noteType ? (
          <TypedArtifactCard shape={shape} noteType={shape.noteType} onDemote={handleDemote} />
        ) : (
          <LooseChip
            shape={shape}
            onPromote={handlePromote}
            onSelect={() => {
              select([shape.id], 'replace');
            }}
          />
        )}
      </div>
    </div>
  );
};
