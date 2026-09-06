// Slug → loaded element lookup, for the element editor (A3, #133).
//
// The canvas's `openElementEditor` payload carries only what the CARD knows
// (a handle, the on-screen label, the projected description). The editor
// edits FIELDS THE CARD NEVER RENDERS — technology, tags — so it has to
// read the element itself out of the loaded model, which is also the only
// place its KIND lives. Kind matters twice: `technology` exists on four
// kinds only, and it disambiguates the delete/patch routes when one slug
// occurs under more than one type directory.

import type { C4Model, ElementKind, LoadedElement } from '@workspec/c4-model';

/** A located element together with the kind whose directory it was found in. */
export interface FoundElement {
  readonly kind: ElementKind;
  readonly element: LoadedElement;
}

/**
 * Finds the element with `slug`, searching every kind's map.
 *
 * Returns `null` when nothing matches — the caller must handle it, because
 * a canvas node can outlive its file (an edit landed but the refetch has
 * not, or the diagram references an element that was deleted on disk).
 *
 * A slug can legitimately exist under two kinds (the server treats that as
 * a 409 on an un-kinded write). This returns the FIRST match, which is
 * enough to open the editor; the server still refuses an ambiguous write,
 * and its error surfaces in the shell's write-error banner.
 */
export function findElementBySlug(model: C4Model, slug: string): FoundElement | null {
  for (const [kind, bySlug] of Object.entries(model.elements)) {
    const element = bySlug.get(slug);
    if (element !== undefined) return { kind: kind as ElementKind, element };
  }
  return null;
}
