import type { PositionedDiagram } from '../../src/index.js';

/**
 * Projects a `PositionedDiagram` down to the geometry the round-trip
 * contract actually promises — node positions/sizes and edge routes — and
 * drops everything else (including `pinned`). Round-tripping through
 * `serialize` legitimately flips `pinned` from `false` to `true` for every
 * previously-auto node (that's the whole point of "graduating" a layout to
 * curated), so a full deep-equal including `pinned` would fail for a
 * reason that isn't a bug. Positions must still be pixel-identical.
 */
export function geometryOf(positioned: PositionedDiagram): unknown {
  return {
    nodes: positioned.nodes
      .map((node) => ({ nodeId: node.nodeId, x: node.x, y: node.y, width: node.width, height: node.height }))
      .sort((a, b) => (a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0)),
    edges: positioned.edges.map((edge) => ({ from: edge.from, to: edge.to, route: edge.route })),
  };
}
