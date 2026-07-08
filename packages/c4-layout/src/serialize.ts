import { Layout } from '@workspec/c4-schema';
import { edgeKey } from './sorting/edge-key.js';
import type { PositionedDiagram } from './model/positioned-diagram.types.js';

/**
 * Converts a `layoutDiagram` result back into the c4-schema `Layout` shape:
 * every node pinned at its computed position (including width/height), and
 * every edge's route persisted as a waypoint hint. This is how a team
 * graduates from auto-layout to a curated `.layout/` file — write the
 * result of `serialize(await layoutDiagram(...))` to
 * `.workspec/diagrams/.layout/<slug>.yaml` and every subsequent
 * `layoutDiagram` call for that diagram becomes full-manual, reproducing
 * these exact positions (see the round-trip test).
 *
 * Validates against `@workspec/c4-schema`'s `Layout` schema before
 * returning — `Layout.parse` throws if the shape this function built is
 * ever inconsistent with the schema, which would be a bug in this
 * function, not a caller input error.
 */
export function serialize(positioned: PositionedDiagram): Layout {
  const nodes: Record<string, { x: number; y: number; width: number; height: number }> = {};
  for (const node of positioned.nodes) {
    nodes[node.nodeId] = { x: node.x, y: node.y, width: node.width, height: node.height };
  }

  const edges: Record<string, { waypoints: { x: number; y: number }[] }> = {};
  for (const edge of positioned.edges) {
    edges[edgeKey(edge)] = { waypoints: edge.route.map(({ x, y }) => ({ x, y })) };
  }

  return Layout.parse({ version: 1, nodes, edges });
}
