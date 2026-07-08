import { describe, expect, it } from 'vitest';
import type { PositionedDiagram, PositionedEdge, PositionedNode } from '@workspec/c4-layout';
import { Layout } from '@workspec/c4-schema';
import { serializeForWrite } from './serialize-for-write.js';

function makeNode(nodeId: string, x: number, y: number): PositionedNode {
  return {
    nodeId,
    slug: nodeId,
    kind: 'container',
    title: nodeId,
    description: null,
    technology: null,
    tags: [],
    position: null,
    injected: false,
    dangling: false,
    x,
    y,
    width: 300,
    height: 110,
    pinned: true,
  };
}

function makeEdge(from: string, to: string): PositionedEdge {
  return {
    from,
    to,
    label: null,
    category: null,
    lens: null,
    dangling: false,
    route: [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ],
  };
}

describe('serializeForWrite', () => {
  it('serializes a positioned diagram with no prior layout data', () => {
    const diagram: PositionedDiagram = { nodes: [makeNode('a', 10, 20)], edges: [] };
    const layout = serializeForWrite(null, diagram);
    expect(layout.nodes.a).toEqual({ x: 10, y: 20, width: 300, height: 110 });
  });

  it('merges the current lens over the existing layout, preserving keys the current lens does not touch', () => {
    const existing = Layout.parse({
      version: 1,
      nodes: {
        a: { x: 1, y: 1, width: 300, height: 110 },
        // "b" belongs to the OTHER lens of a c4-container diagram — must survive the merge.
        b: { x: 2, y: 2, width: 300, height: 110 },
      },
    });
    const diagram: PositionedDiagram = { nodes: [makeNode('a', 999, 888)], edges: [] };
    const merged = serializeForWrite(existing, diagram);
    expect(merged.nodes.a).toEqual({ x: 999, y: 888, width: 300, height: 110 });
    expect(merged.nodes.b).toEqual({ x: 2, y: 2, width: 300, height: 110 });
  });

  it('preserves the existing viewport untouched', () => {
    const existing = Layout.parse({
      version: 1,
      nodes: {},
      viewport: { x: 5, y: 6, zoom: 2 },
    });
    const diagram: PositionedDiagram = { nodes: [makeNode('a', 1, 2)], edges: [] };
    expect(serializeForWrite(existing, diagram).viewport).toEqual({ x: 5, y: 6, zoom: 2 });
  });

  it('merges edge routing hints the same way', () => {
    const existing = Layout.parse({
      version: 1,
      nodes: {},
      edges: { 'x->y': { waypoints: [{ x: 0, y: 0 }] } },
    });
    const diagram: PositionedDiagram = { nodes: [], edges: [makeEdge('a', 'b')] };
    const merged = serializeForWrite(existing, diagram);
    expect(merged.edges?.['x->y']).toEqual({ waypoints: [{ x: 0, y: 0 }] });
    expect(merged.edges?.['a->b']).toEqual({ waypoints: [{ x: 0, y: 0 }, { x: 10, y: 10 }] });
  });
});
