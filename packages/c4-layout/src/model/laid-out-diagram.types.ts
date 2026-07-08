import type { PositionedDiagram } from './positioned-diagram.types.js';

/**
 * One `C4Model` diagram, laid out — `layoutModel`'s per-diagram result.
 * Mirrors `ResolvedDiagram`'s `view`/`lensViews` split: exactly one is
 * non-null, matching the source diagram's shape (`c4-container` diagrams
 * carry `lensViews`, every other diagram type carries `view`).
 */
export interface LaidOutDiagram {
  readonly slug: string;
  readonly path: string;
  readonly title: string;
  readonly type: string;
  readonly view: PositionedDiagram | null;
  readonly lensViews: { readonly logical: PositionedDiagram; readonly deployment: PositionedDiagram } | null;
}
