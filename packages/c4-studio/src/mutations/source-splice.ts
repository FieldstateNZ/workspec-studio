/**
 * A byte-range replacement in a source text. `start`/`end` are offsets into
 * the ORIGINAL text (never into a partially-spliced intermediate), so a
 * whole batch can be resolved up front against one parse and applied in one
 * pass — which is the only way the offsets stay meaningful.
 */
export interface Splice {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

/**
 * Applies `splices` to `source` in one left-to-right pass.
 *
 * Splices must not overlap; two insertions at the SAME offset are legal and
 * are emitted in argument order (this is how two appends to one sequence
 * keep their order). Overlap is a caller bug — two edits claiming the same
 * bytes have no defined merge — so it throws rather than guessing; every
 * caller here derives its ranges from distinct nodes of one parse, so an
 * overlap means an index was computed against the wrong document.
 */
export function applySplices(source: string, splices: readonly Splice[]): string {
  const ordered = splices
    .map((splice, order) => ({ splice, order }))
    .sort((a, b) => a.splice.start - b.splice.start || a.order - b.order);

  const out: string[] = [];
  let cursor = 0;
  for (const { splice } of ordered) {
    if (splice.start < cursor) {
      throw new Error(
        `overlapping source splices: [${String(splice.start)}, ${String(splice.end)}) starts before the previous splice ended (${String(cursor)})`,
      );
    }
    out.push(source.slice(cursor, splice.start), splice.text);
    cursor = splice.end;
  }
  out.push(source.slice(cursor));
  return out.join('');
}
