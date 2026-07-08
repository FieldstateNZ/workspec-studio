import { describe, expect, it } from 'vitest';
import type { Layout } from '@workspec/c4-schema';
import { layoutDiagram } from '../src/layout-diagram.js';
import { rectsOverlap } from '../src/index.js';
import { assertNoOverlaps } from './helpers/assert-no-overlaps.js';
import { makeEdge, makeNode } from './helpers/make-view.js';

describe('dangling edges', () => {
  it('drops an edge flagged dangling by c4-model — absent from output, no throw', async () => {
    const nodes = [makeNode('a'), makeNode('b')];
    const edges = [
      makeEdge('a', 'b'),
      // The documented no-system shape: an endpoint that resolves to no
      // node in the view. c4-model already diagnosed it; this package's
      // contract is to skip it silently, never throw.
      makeEdge('a', 'missing', { dangling: true }),
    ];

    const positioned = await layoutDiagram({ nodes, edges, layout: null });

    expect(positioned.edges.map((edge) => `${edge.from}->${edge.to}`)).toEqual(['a->b']);
    expect(positioned.nodes).toHaveLength(2);
  });
});

describe('overlapping pins', () => {
  it('preserves mutually overlapping pins exactly — pins are never moved, even off each other', async () => {
    const nodes = [makeNode('a'), makeNode('b'), makeNode('c'), makeNode('free')];
    // Three pins at IDENTICAL coordinates: the zero-overlap guarantee
    // explicitly excludes pin-vs-pin (see the README's Mixed mode section)
    // — a curated layout is authoritative even when it collides with
    // itself, and "fixing" it here would violate pinned-exact.
    const layout: Layout = {
      version: 1,
      nodes: {
        a: { x: 100, y: 100, width: 300, height: 110 },
        b: { x: 100, y: 100, width: 300, height: 110 },
        c: { x: 100, y: 100, width: 300, height: 110 },
      },
    };

    const positioned = await layoutDiagram({ nodes, edges: [], layout });

    const byId = new Map(positioned.nodes.map((node) => [node.nodeId, node]));
    for (const nodeId of ['a', 'b', 'c']) {
      expect(byId.get(nodeId)).toMatchObject({
        x: 100,
        y: 100,
        width: 300,
        height: 110,
        pinned: true,
      });
    }

    // The unpinned node must still clear every pinned rect — the guarantee
    // this package DOES own.
    const free = byId.get('free');
    if (!free) throw new Error('free node missing from output');
    expect(free.pinned).toBe(false);
    for (const nodeId of ['a', 'b', 'c']) {
      const pin = byId.get(nodeId);
      if (!pin) throw new Error(`${nodeId} missing from output`);
      expect(rectsOverlap(free, pin), `expected "free" to clear pinned "${nodeId}"`).toBe(false);
    }
  });
});

describe('degenerate inputs', () => {
  it('empty diagram lays out to {nodes: [], edges: []}', async () => {
    const positioned = await layoutDiagram({ nodes: [], edges: [], layout: null });
    expect(positioned).toStrictEqual({ nodes: [], edges: [] });
  });

  it('single node lays out at the default footprint, unpinned, no edges', async () => {
    const positioned = await layoutDiagram({ nodes: [makeNode('only')], edges: [], layout: null });

    expect(positioned.edges).toEqual([]);
    expect(positioned.nodes).toHaveLength(1);
    expect(positioned.nodes[0]).toMatchObject({
      nodeId: 'only',
      width: 300,
      height: 110,
      pinned: false,
    });
    assertNoOverlaps(positioned.nodes);
  });
});

describe('edge-hint passthrough', () => {
  it('a .layout/ edge hint overrides the elbow router verbatim', async () => {
    const nodes = [makeNode('a'), makeNode('b')];
    const edges = [makeEdge('a', 'b')];

    // Waypoints deliberately unrelated to any elbow route the final rects
    // could produce — proving verbatim passthrough, not recomputation.
    const waypoints = [
      { x: -50, y: 999 },
      { x: 1234, y: 5678 },
      { x: 42, y: 42 },
    ];
    const layout: Layout = {
      version: 1,
      nodes: {},
      edges: { 'a->b': { waypoints } },
    };

    const withHint = await layoutDiagram({ nodes, edges, layout });
    expect(withHint.edges).toHaveLength(1);
    expect(withHint.edges[0]?.route).toEqual(waypoints);

    // Same input without the hint routes via the elbow router instead —
    // the two must genuinely differ for the assertion above to mean
    // anything.
    const withoutHint = await layoutDiagram({ nodes, edges, layout: null });
    expect(withoutHint.edges[0]?.route).not.toEqual(waypoints);
  });
});
