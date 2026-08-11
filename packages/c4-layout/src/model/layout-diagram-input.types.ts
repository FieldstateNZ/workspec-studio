import type { ResolvedDiagramEdge, ResolvedDiagramNode } from '@workspec/c4-model';
import type { Layout } from '@workspec/c4-schema';
import type { LayoutDirection } from './layout-direction.js';

/**
 * Input to `layoutDiagram`: one resolved view's nodes and edges (a
 * `c4-container` diagram's `view.nodes`/`view.edges` or one of its
 * `lensViews.{logical,deployment}`) plus that diagram's optional `.layout/`
 * data. `layout` is the parsed file contents (`LoadedLayoutInfo.data`), not
 * the wrapper — callers already holding a `ResolvedDiagram` pass
 * `diagram.layout?.data ?? null`.
 */
export interface LayoutDiagramInput {
  readonly nodes: readonly ResolvedDiagramNode[];
  readonly edges: readonly ResolvedDiagramEdge[];
  readonly layout: Layout | null;
}

/** Options accepted by `layoutDiagram`/`layoutModel`. */
export interface LayoutDiagramOptions {
  /** Layout flow direction. Defaults to `'LR'` — see {@link LayoutDirection}. */
  readonly direction?: LayoutDirection;
  /**
   * Gap (px) between adjacent node layers — ELK's
   * `elk.layered.spacing.nodeNodeBetweenLayers`. ADDITIVE option (S4 fix
   * round, #120): omitted, the pinned default (80) applies and output is
   * byte-identical to before this option existed.
   *
   * No shipped caller overrides it today. `@workspec/c4-ui` did (to widen
   * the gap for its midpoint label pills) and that was reverted in #134 —
   * widening the corridor cannot make a SCREEN-space pill fit a PAGE-space
   * gap, and it cost 72% bbox width on the dogfood container diagram. The
   * option stays because "let the caller, which has rendering context this
   * package deliberately lacks, choose the gap" is still a legitimate seam
   * — but reach for level-of-detail before reaching for spacing.
   */
  readonly layerSpacing?: number;
}
