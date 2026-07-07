import type { ElkNode } from 'elkjs/lib/elk-api.js';
import type { ResolvedDiagramEdge, ResolvedDiagramNode } from '@workspec/c4-model';
import { elkLayoutOptionsFor } from './elk-layout-options.js';
import type { LayoutDirection } from '../model/layout-direction.js';

/**
 * Builds the ELK JSON graph for the auto-layout pass. Every node in the
 * view is included — even the ones that will end up pinned — because
 * removing them from the graph would disconnect any edge touching them
 * (elkjs's layered algorithm rejects an edge whose endpoint isn't one of
 * its own children); this pass only cares about ELK's *auto* positions for
 * unpinned nodes; the pinned nodes' ELK-computed coordinates are discarded
 * by `resolveNodeRects` immediately after.
 *
 * Edge ids are a plain sequential index, not the `"<from>-><to>"` key —
 * this package never reads ELK's own edge/route output back (see the
 * package README's "Why not ELK for edge routing" section), so uniqueness
 * is the only requirement, and a parallel-edge pair sharing a `.layout/`
 * key would otherwise collide as an ELK id.
 */
export function buildElkGraph(
  nodes: readonly ResolvedDiagramNode[],
  edges: readonly ResolvedDiagramEdge[],
  sizeFor: (nodeId: string) => { readonly width: number; readonly height: number },
  direction: LayoutDirection,
): ElkNode {
  return {
    id: 'root',
    layoutOptions: elkLayoutOptionsFor(direction),
    children: nodes.map((node) => {
      const size = sizeFor(node.nodeId);
      return { id: node.nodeId, width: size.width, height: size.height };
    }),
    edges: edges.map((edge, index) => ({
      id: `e${index}`,
      sources: [edge.from],
      targets: [edge.to],
    })),
  };
}
