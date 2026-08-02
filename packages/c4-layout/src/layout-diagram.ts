import { C4_NODE_HEIGHT, C4_NODE_WIDTH } from './constants/node-size.js';
import { buildElkGraph } from './elk/build-elk-graph.js';
import { runAutoLayout } from './elk/run-auto-layout.js';
import type {
  LayoutDiagramInput,
  LayoutDiagramOptions,
} from './model/layout-diagram-input.types.js';
import type { PositionedDiagram, PositionedNode } from './model/positioned-diagram.types.js';
import { pinsForNodes } from './pinning/pins-for-nodes.js';
import { resolveNodeRects } from './pinning/resolve-node-rects.js';
import { hintsForEdges } from './routing/hints-for-edges.js';
import { resolveEdgeRoutes } from './routing/resolve-edge-routes.js';
import { sortEdgesByKey } from './sorting/sort-edges.js';
import { sortNodesById } from './sorting/sort-nodes.js';

/**
 * Lays out one resolved diagram view: runs elkjs's `layered` algorithm once
 * for auto placement, merges the result with any `.layout/` pins (exact,
 * authoritative, never moved), resolves the remaining auto nodes around
 * them with zero overlaps, and routes every non-dangling edge.
 *
 * Full-auto (no `layout`, or a `layout` with an empty `nodes` map) and
 * full-manual (every node pinned) are not special-cased — they're just the
 * `pins` map being empty or complete, respectively, going through the exact
 * same `resolveNodeRects`/`resolveEdgeRoutes` calls as any mixed case. This
 * is the "one code path" the design brief requires: there is no branch in
 * this function that distinguishes them.
 *
 * Determinism: `nodes`/`edges` are sorted (by `nodeId` / edge key) before
 * anything touches elkjs, and every ELK option is fixed explicitly (see
 * `elkLayoutOptionsFor`) — identical input therefore always produces
 * identical output, including across separate `layoutDiagram` calls and
 * separate underlying ELK instances (`runAutoLayout` constructs a fresh one
 * per call).
 *
 * Dangling edges (`edge.dangling === true` — an unresolved `from`/`to`,
 * including the no-system `__system__` case `@workspec/c4-model` already
 * diagnoses) are dropped before layout runs. They carry no valid node ids
 * to route between, so silently skipping them is the documented behaviour;
 * this function never throws for them.
 */
export async function layoutDiagram(
  input: LayoutDiagramInput,
  options: LayoutDiagramOptions = {},
): Promise<PositionedDiagram> {
  const direction = options.direction ?? 'LR';

  const sortedNodes = sortNodesById(input.nodes);
  const nodeIds = sortedNodes.map((node) => node.nodeId);
  const pins = pinsForNodes(input.layout, sortedNodes);
  const sizeFor = (nodeId: string): { width: number; height: number } => {
    const pin = pins.get(nodeId);
    return { width: pin?.width ?? C4_NODE_WIDTH, height: pin?.height ?? C4_NODE_HEIGHT };
  };

  const routableEdges = sortEdgesByKey(input.edges).filter((edge) => !edge.dangling);

  const elkGraph = buildElkGraph(
    sortedNodes,
    routableEdges,
    sizeFor,
    direction,
    options.layerSpacing,
  );
  const autoPositions = await runAutoLayout(elkGraph);

  const rects = resolveNodeRects(nodeIds, autoPositions, pins, direction);

  const hints = hintsForEdges(input.layout, routableEdges, sortedNodes);
  const edges = resolveEdgeRoutes(routableEdges, rects, hints, direction);

  const nodes: PositionedNode[] = sortedNodes.map((node) => {
    const rect = rects.get(node.nodeId);
    // Every id in `nodeIds` was just fed into `resolveNodeRects`, which
    // returns an entry for each one unconditionally — this is unreachable,
    // guarded only so `rect` narrows without a non-null assertion.
    const { x, y, width, height, pinned } = rect ?? {
      x: 0,
      y: 0,
      width: C4_NODE_WIDTH,
      height: C4_NODE_HEIGHT,
      pinned: false,
    };
    return { ...node, x, y, width, height, pinned };
  });

  return { nodes, edges };
}
