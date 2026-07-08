import type { ResolvedDiagramEdge, ResolvedDiagramNode } from '@workspec/c4-model';
import type { LayoutPoint } from '../geometry/point.js';

/**
 * One resolved diagram node, laid out: every field {@link ResolvedDiagramNode}
 * carries (slug, kind, title, tags, ...) plus the geometry `layoutDiagram`
 * computed for it. `pinned` is true when this position came verbatim from
 * the diagram's `.layout/` file rather than the auto-layout pass — the
 * single flag that distinguishes "authoritative" from "computed" in the
 * output, mirroring the mixed-mode contract.
 */
export interface PositionedNode extends ResolvedDiagramNode {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly pinned: boolean;
}

/**
 * One resolved diagram edge, laid out: every field {@link ResolvedDiagramEdge}
 * carries plus `route`, an ordered orthogonal point list from the `from`
 * node's boundary to the `to` node's boundary. Edges whose `dangling` flag
 * was set by `@workspec/c4-model` never reach this shape — `layoutDiagram`
 * drops them before laying out (see the package README's "Dangling edges"
 * section).
 */
export interface PositionedEdge extends ResolvedDiagramEdge {
  readonly route: readonly LayoutPoint[];
}

/**
 * The output of one `layoutDiagram` call: a single resolved view's nodes and
 * edges, positioned. Mirrors `ResolvedDiagramView` shape-for-shape — this is
 * deliberate, not incidental: a `c4-container` diagram's two lenses each
 * produce one `PositionedDiagram`, combined by `layoutModel` into a
 * `LaidOutDiagram` the same way `@workspec/c4-model` combines its two
 * `ResolvedDiagramView`s into one `ResolvedDiagram`.
 */
export interface PositionedDiagram {
  readonly nodes: readonly PositionedNode[];
  readonly edges: readonly PositionedEdge[];
}
