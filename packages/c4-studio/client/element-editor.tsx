// The element editor (A3, #133) — the panel `C4CanvasHost.openElementEditor`
// opens, and the ONE place tree-wide element deletion is reachable from.
//
// PARITY. Modelled on enterprise's `components/diagrams/C4ElementEditor.tsx`,
// which is a CENTRED modal, not a rail — its own comment (L40) says why:
// "Centered Dialog so it never covers the toolbar". Copied from it: the
// `Edit element` title and `Update the element's name and description.`
// subtitle; Name as a required field with a `*` and an inline `Required`
// alert when empty; Description with the softer `Required for element
// validation` warning and the helper line explaining you may save without
// it; a single `Save` action in the footer; ⌘/Ctrl+Enter to save; Escape to
// dismiss. Enterprise uses shadcn `Dialog`; this package ships plain CSS
// over the WorkSpec tokens, so the chrome is hand-rolled with the same
// shape and the same strings.
//
// TWO DELIBERATE ADDITIONS, both required by #133 rather than preferred:
//
//  1. Technology and Tags. Enterprise's dialog edits title + description
//     because that is all its artifact content route takes. The studio's
//     `PATCH /api/elements` takes four fields, and the model has nowhere
//     else to author the other two. Technology renders only for the four
//     kinds whose schema HAS the field (`TECHNOLOGY_KINDS` — c4-schema's
//     shared `C4Element`); offering it on an actor would author a key the
//     schema rejects.
//
//  2. "Delete element everywhere". Canvas delete is DIAGRAM-SCOPED by the
//     A2 lead ruling — it removes the node ref and leaves the file — so
//     `DELETE /api/elements` is bound to NO canvas gesture, and without a
//     surface here it would be unreachable from the app at all (#133
//     ledger: "the element editor must surface tree-wide delete with
//     confirmation"). The confirmation copies enterprise's own destructive
//     pattern, which is NOT in this dialog but in `ElementsPanel.tsx:276-313`:
//     an AlertDialog titled `Delete element?` with Cancel + a destructive
//     Delete. The body text is restated for a file-backed model (files in a
//     working tree, not artifacts on a branch), which is the only honest
//     version of that sentence here.

import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, ReactElement } from 'react';
import type { ElementKind } from '@workspec/c4-model';
import { TECHNOLOGY_KINDS } from '../src/mutations/technology-kinds.js';

/** The element the editor is open on, as read from the loaded model. */
export interface ElementEditorTarget {
  /** The element slug — the handle every write route keys on. */
  readonly slug: string;
  /** The kind whose directory holds the file, or null when it could not be located. */
  readonly kind: ElementKind | null;
  readonly title: string;
  readonly description: string;
  readonly technology: string;
  readonly tags: readonly string[];
}

/** Only the fields the user actually changed — the PATCH body, minus the slug. */
export interface ElementEditorPatch {
  readonly name?: string;
  readonly description?: string;
  readonly technology?: string;
  readonly tags?: readonly string[];
}

export interface ElementEditorProps {
  target: ElementEditorTarget;
  /** Persist the patch. Rejecting surfaces the message inline and keeps the panel open. */
  onSave: (patch: ElementEditorPatch) => Promise<void>;
  /** Delete the element everywhere (`DELETE /api/elements`). Only ever called after confirmation. */
  onDelete: () => Promise<void>;
  /** Dismiss without saving. */
  onClose: () => void;
}

/** `a, b , ,c` → `['a','b','c']`. Blank entries are dropped, not authored. */
function parseTags(raw: string): readonly string[] {
  return raw
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

function sameTags(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((tag, i) => tag === b[i]);
}

export function ElementEditor(props: ElementEditorProps): ReactElement {
  const { target, onSave, onDelete, onClose } = props;
  const [name, setName] = useState(target.title);
  const [description, setDescription] = useState(target.description);
  const [technology, setTechnology] = useState(target.technology);
  const [tags, setTags] = useState(target.tags.join(', '));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
    nameRef.current?.select();
  }, []);

  const nameMissing = name.trim().length === 0;
  const showTechnology = target.kind !== null && TECHNOLOGY_KINDS.has(target.kind);

  function buildPatch(): ElementEditorPatch {
    const nextTags = parseTags(tags);
    return {
      ...(name.trim() !== target.title ? { name: name.trim() } : {}),
      ...(description !== target.description ? { description } : {}),
      ...(showTechnology && technology !== target.technology ? { technology } : {}),
      ...(sameTags(nextTags, target.tags) ? {} : { tags: nextTags }),
    };
  }

  function save(): void {
    if (busy || nameMissing) return;
    const patch = buildPatch();
    // `PATCH /api/elements` refuses a body with no fields, so a no-op save
    // is a dismiss — not a round trip that comes back 400.
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    setBusy(true);
    setError(null);
    onSave(patch)
      .then(onClose)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
        setBusy(false);
      });
  }

  function remove(): void {
    if (busy) return;
    setBusy(true);
    setError(null);
    onDelete()
      .then(onClose)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
        setBusy(false);
        setConfirmingDelete(false);
      });
  }

  /**
   * The panel swallows every key it sees.
   *
   * Escape and ⌘/Ctrl+Enter are handled here (enterprise gets both from
   * Radix + its own handler). Everything else is stopped for the reason the
   * inline name editor stops keys: the canvas's Delete/Backspace branch
   * deletes the selected shapes, and a user backspacing through a
   * description must never reach it. `C4Diagram`'s branch independently
   * refuses editable targets, so this is the second of two locks, not the
   * only one.
   */
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      if (confirmingDelete) setConfirmingDelete(false);
      else onClose();
      return;
    }
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      save();
    }
  }

  return (
    <div className="c4sh-modal-scrim" data-canvas-ui>
      <div
        className="c4sh-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="c4sh-editor-title"
        onKeyDown={onKeyDown}
      >
        <h2 className="c4sh-modal-title" id="c4sh-editor-title">
          Edit element
        </h2>
        <p className="c4sh-modal-sub">Update the element&rsquo;s name and description.</p>

        <label className="c4sh-field" htmlFor="c4sh-el-name">
          <span className="c4sh-field-label">
            Name <span className="c4sh-req">*</span>
            {nameMissing && <span className="c4sh-field-alert">Required</span>}
          </span>
          <input
            id="c4sh-el-name"
            ref={nameRef}
            className={nameMissing ? 'c4sh-input c4sh-input-invalid' : 'c4sh-input'}
            value={name}
            placeholder="Element name"
            onChange={(e) => {
              setName(e.target.value);
            }}
          />
        </label>

        <label className="c4sh-field" htmlFor="c4sh-el-desc">
          <span className="c4sh-field-label">
            Description
            {description.trim().length === 0 && (
              <span className="c4sh-field-warn">Required for element validation</span>
            )}
          </span>
          <textarea
            id="c4sh-el-desc"
            className={
              description.trim().length === 0 ? 'c4sh-textarea c4sh-textarea-warn' : 'c4sh-textarea'
            }
            rows={5}
            value={description}
            placeholder="What is this element?"
            onChange={(e) => {
              setDescription(e.target.value);
            }}
          />
          <span className="c4sh-field-help">
            Required for the element to validate. You can still save without it — it stays invalid
            until described.
          </span>
        </label>

        {showTechnology && (
          <label className="c4sh-field" htmlFor="c4sh-el-tech">
            <span className="c4sh-field-label">Technology</span>
            <input
              id="c4sh-el-tech"
              className="c4sh-input"
              value={technology}
              placeholder="PostgreSQL, Node.js…"
              onChange={(e) => {
                setTechnology(e.target.value);
              }}
            />
          </label>
        )}

        <label className="c4sh-field" htmlFor="c4sh-el-tags">
          <span className="c4sh-field-label">Tags</span>
          <input
            id="c4sh-el-tags"
            className="c4sh-input"
            value={tags}
            placeholder="comma, separated"
            onChange={(e) => {
              setTags(e.target.value);
            }}
          />
        </label>

        {error !== null && (
          <div className="c4sh-modal-error" role="alert">
            {error}
          </div>
        )}

        <div className="c4sh-modal-actions">
          {confirmingDelete ? (
            <div className="c4sh-confirm" role="alertdialog" aria-label="Delete element?">
              <span className="c4sh-confirm-text">
                <strong>Delete element?</strong> {target.title} is removed from every diagram and
                its file is deleted from the working tree.
              </span>
              <button
                type="button"
                className="c4sh-btn"
                disabled={busy}
                onClick={() => {
                  setConfirmingDelete(false);
                }}
              >
                Cancel
              </button>
              <button type="button" className="c4sh-btn c4sh-btn-danger" disabled={busy} onClick={remove}>
                Delete
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                className="c4sh-btn c4sh-btn-danger-ghost"
                disabled={busy}
                onClick={() => {
                  setConfirmingDelete(true);
                }}
              >
                Delete element everywhere
              </button>
              <span className="c4sh-modal-spacer" />
              <button type="button" className="c4sh-btn" disabled={busy} onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="c4sh-btn c4sh-btn-primary"
                disabled={busy || nameMissing}
                onClick={save}
              >
                {busy ? 'Saving…' : 'Save'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
