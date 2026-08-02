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
   * byte-identical to before this option existed — this package has no
   * rendering context to measure labels against, so a caller wanting
   * label-aware spacing (e.g. `@workspec/canvas-c4`'s midpoint label
   * pills) computes the value itself and passes it here.
   */
  readonly layerSpacing?: number;
}
