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

// Label-width estimate (px) for an edge's midpoint pill — the Enterprise
// `autoLayout.ts` estimate (`ceil(length * 6.5 + 30)`) verbatim, so the
// spacing this layer derives matches what the enterprise dagre engine
// guaranteed by construction.
function estimateEdgeLabelWidth(label: string | null): number {
  if (label === null || label === '') return 0;
  return Math.ceil(label.length * 6.5 + 30);
}

/**
 * Label-aware inter-layer gap for one view's edges — the Enterprise LR
 * `ranksep = max(120, maxLabelWidth + 60)` formula (S4 fix round, #120).
 * `@workspec/c4-layout` deliberately keeps a fixed label-unaware 80px
 * default (it has no rendering context to measure against), which lets a
 * midpoint label pill clip under the node cards it runs between; this
 * layer DOES know the pill rendering (screen-space 11px chip at the route
 * midpoint — `@workspec/canvas`'s ConnectorLayer and c4-ui's renderSvg
 * alike), so every layout call in the composed pipeline passes this value
 * through `LayoutDiagramOptions.layerSpacing`.
 */
export function labelAwareLayerSpacing(
  edges: readonly { readonly label: string | null }[],
): number {
  let maxLabelWidth = 0;
  for (const edge of edges) {
    const width = estimateEdgeLabelWidth(edge.label);
    if (width > maxLabelWidth) maxLabelWidth = width;
  }
  return Math.max(120, maxLabelWidth + 60);
}

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
 * (@workspec/c4-layout), with label-aware layer spacing (see
 * {@link labelAwareLayerSpacing}) and each node's resolved size carried
 * through for the projection.
 */
export const elkC4Layout: C4LayoutFn = async (view, layout, direction) => {
  const positioned = await layoutDiagram(
    { nodes: view.nodes, edges: view.edges, layout },
    {
      layerSpacing: labelAwareLayerSpacing(view.edges),
      ...(direction !== undefined ? { direction } : {}),
    },
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
