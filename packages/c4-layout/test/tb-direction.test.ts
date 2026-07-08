import { describe, expect, it } from 'vitest';
import { layoutDiagram } from '../src/layout-diagram.js';
import { assertNoOverlaps } from './helpers/assert-no-overlaps.js';
import { findSystemContext, loadRepresentativeModel } from './helpers/load-representative-model.js';

/**
 * The `'TB'` direction option through the same mixed-pin fixture the LR
 * tests use — every hard contract (repeat-run determinism, pinned-exact,
 * zero overlaps) must hold identically for both directions, since `'TB'`
 * flips the nudge axis (`resolveAutoPlacement` nudges along X instead of
 * Y) and the ELK flow direction, both of which are direction-dependent
 * code the LR-only suite never exercised.
 */
describe('TB direction', () => {
  it('mixed pins: deterministic, pinned exact, unpinned collision-free', async () => {
    const model = await loadRepresentativeModel();
    const diagram = findSystemContext(model);
    if (!diagram.view) throw new Error('system-context fixture should resolve a single view');
    const layout = diagram.layout?.data ?? null;
    expect(layout).not.toBeNull();

    const input = { nodes: diagram.view.nodes, edges: diagram.view.edges, layout };

    const first = await layoutDiagram(input, { direction: 'TB' });
    const second = await layoutDiagram(input, { direction: 'TB' });

    expect(second).toStrictEqual(first);

    const byId = new Map(first.nodes.map((node) => [node.nodeId, node]));
    expect(byId.get('architect')).toMatchObject({
      x: 80,
      y: 200,
      width: 240,
      height: 120,
      pinned: true,
    });
    expect(byId.get('main-system')).toMatchObject({
      x: 400,
      y: 200,
      width: 300,
      height: 110,
      pinned: true,
    });
    expect(byId.get('payment-gateway')?.pinned).toBe(false);

    assertNoOverlaps(first.nodes);
  });

  it('routes computed edges vertically (bottom edge out, top edge in), unlike LR', async () => {
    const model = await loadRepresentativeModel();
    const diagram = findSystemContext(model);
    if (!diagram.view) throw new Error('system-context fixture should resolve a single view');

    const positioned = await layoutDiagram(
      { nodes: diagram.view.nodes, edges: diagram.view.edges, layout: null },
      { direction: 'TB' },
    );

    const byId = new Map(positioned.nodes.map((node) => [node.nodeId, node]));
    for (const edge of positioned.edges) {
      const from = byId.get(edge.from);
      const to = byId.get(edge.to);
      if (!from || !to) throw new Error(`edge ${edge.from}->${edge.to} references a missing node`);
      const start = edge.route[0];
      const end = edge.route[edge.route.length - 1];
      expect(start).toEqual({ x: from.x + from.width / 2, y: from.y + from.height });
      expect(end).toEqual({ x: to.x + to.width / 2, y: to.y });
    }
  });
});
