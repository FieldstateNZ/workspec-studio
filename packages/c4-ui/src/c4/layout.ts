import type { Layout } from '@workspec/c4-schema';
import type { ResolvedDiagram, ResolvedDiagramView } from '@workspec/c4-model';
import { layoutDiagram, type LayoutDirection } from '@workspec/c4-layout';
import {
  buildC4Shapes,
  viewFor,
  type BuildC4ShapesOptions,
  type C4Lens,
  type NodePlacement,
  type ProjectionResult,
} from './project-model.js';

// The decision-A composition (#119): @workspec/c4-layout's elk pipeline is
// the POSITION authority (`.layout/` pins exact + auto nodes resolved
// around them, deterministic); edge LOOK comes from @workspec/canvas's
// orthogonal router at render time, so `.layout` edge waypoints are
// advisory — the projection never reads `PositionedEdge.route`. This
// retires the enterprise dagre-fresh / seat-incremental placement paths.

// Inter-layer spacing is deliberately NOT derived here (reverted, #134).
// The S4 fix round (#120) added a `labelAwareLayerSpacing` helper copying
// enterprise's LR `ranksep = max(120, maxLabelWidth + 60)` scalar, on the
// theory that a wider corridor would make the midpoint label pills fit by
// construction. It does not, and the docstring that claimed it did was
// measurably false:
//
//   - Enterprise's dagre HALVES that ranksep (`makeSpaceForEdgeLabels`)
//     and spends the difference on an injected label-proxy RANK that
//     actually holds the labels. We ported the scalar without the rank,
//     so the whole gap stays empty.
//   - The pill is screen-space (fixed 11px / maxWidth:180 ⇒ 194x19 screen
//     px) while the gap is page-space, so under fit-to-width the corridor
//     asymptotes at ~270px only as the card title shrinks past legibility.
//     No spacing value wins.
//   - Measured on the dogfood container diagram: raising the gap 80 -> 422
//     cost +72% bbox width, dropped fit 0.584 -> 0.339, and made pill-pill
//     overlaps WORSE (26 -> 36 pairs).
//
// So the composed pipeline now passes no `layerSpacing` at all and takes
// `@workspec/c4-layout`'s pinned 80px default. Readability at low zoom is
// handled where it is actually solvable — level-of-detail on the card and
// the edge labels (see `c4-node-component.tsx` / `connector-layer.tsx`).

/**
 * The injectable layout seam: view + pins → node placements (top-left
 * position + the laid-out size, so pinned per-node width/height survive
 * into the projection). `elkC4Layout` (the default) wraps
 * @workspec/c4-layout's `layoutDiagram`; hosts substitute their own for
 * custom placement (position-only `Vec2` records remain assignable — the
 * projection falls back to the default node dims).
 */
export type C4LayoutFn = (
  view: ResolvedDiagramView,
  layout: Layout | null,
  direction?: LayoutDirection,
) => Promise<Record<string, NodePlacement>>;

/**
 * The default layout: elk positions merged with `.layout/` pins
 * (@workspec/c4-layout), at that package's pinned inter-layer spacing,
 * with each node's resolved size carried through for the projection.
 */
export const elkC4Layout: C4LayoutFn = async (view, layout, direction) => {
  const positioned = await layoutDiagram(
    { nodes: view.nodes, edges: view.edges, layout },
    { ...(direction !== undefined ? { direction } : {}) },
  );
  const out: Record<string, NodePlacement> = {};
  for (const n of positioned.nodes) {
    out[n.nodeId] = { x: n.x, y: n.y, width: n.width, height: n.height };
  }
  return out;
};

export interface ProjectC4DiagramOptions extends Omit<BuildC4ShapesOptions, 'positions'> {
  /** Layout implementation; defaults to {@link elkC4Layout}. */
  layoutFn?: C4LayoutFn;
  /** Layout flow direction (elk default 'LR' — C4 reads left-to-right). */
  direction?: LayoutDirection;
}

/**
 * The one-call pipeline: pick the lens view, run the (injectable) layout
 * over it with the diagram's `.layout/` pins, then project to canvas
 * shapes. Prefer `buildC4Shapes` directly when positions are already known
 * (drag reflows, tests).
 */
export async function projectC4Diagram(
  resolved: ResolvedDiagram,
  options: ProjectC4DiagramOptions = {},
): Promise<ProjectionResult> {
  const { layoutFn = elkC4Layout, direction, ...buildOptions } = options;
  const lens: C4Lens = options.lens ?? 'logical';
  const view = viewFor(resolved, lens);
  const positions = await layoutFn(view, resolved.layout?.data ?? null, direction);
  return buildC4Shapes(resolved, { ...buildOptions, positions });
}
