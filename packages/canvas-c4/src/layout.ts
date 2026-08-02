import type { Layout } from '@workspec/c4-schema';
import type { ResolvedDiagram, ResolvedDiagramView } from '@workspec/c4-model';
import { layoutDiagram, type LayoutDirection } from '@workspec/c4-layout';
import type { Vec2 } from '@workspec/canvas';
import {
  buildC4Shapes,
  viewFor,
  type BuildC4ShapesOptions,
  type C4Lens,
  type ProjectionResult,
} from './project-model.js';

// The decision-A composition (#119): @workspec/c4-layout's elk pipeline is
// the POSITION authority (`.layout/` pins exact + auto nodes resolved
// around them, deterministic); edge LOOK comes from @workspec/canvas's
// orthogonal router at render time, so `.layout` edge waypoints are
// advisory — the projection never reads `PositionedEdge.route`. This
// retires the enterprise dagre-fresh / seat-incremental placement paths.

/**
 * The injectable layout seam: view + pins → node top-left positions.
 * `elkC4Layout` (the default) wraps @workspec/c4-layout's `layoutDiagram`;
 * hosts substitute their own for custom placement.
 */
export type C4LayoutFn = (
  view: ResolvedDiagramView,
  layout: Layout | null,
  direction?: LayoutDirection,
) => Promise<Record<string, Vec2>>;

/** The default layout: elk positions merged with `.layout/` pins (@workspec/c4-layout). */
export const elkC4Layout: C4LayoutFn = async (view, layout, direction) => {
  const positioned = await layoutDiagram(
    { nodes: view.nodes, edges: view.edges, layout },
    direction !== undefined ? { direction } : {},
  );
  const out: Record<string, Vec2> = {};
  for (const n of positioned.nodes) {
    out[n.nodeId] = { x: n.x, y: n.y };
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
