import { describe, expect, it } from 'vitest';
import type { Layout } from '@workspec/c4-schema';
import { layoutDiagram } from '../src/layout-diagram.js';
import { assertNoOverlaps } from './helpers/assert-no-overlaps.js';
import { findSystemContext, loadRepresentativeModel } from './helpers/load-representative-model.js';

/**
 * Full-auto (no `.layout/` at all) and full-manual (every node pinned) are
 * not special-cased by `layoutDiagram` — they're the same
 * `resolveNodeRects` call with an empty or a complete `pins` map (see
 * `src/layout-diagram.ts`'s doc comment). This test proves both ends of
 * that spectrum still satisfy the shared contract: every node placed,
 * zero overlaps, and — for full-manual — every position taken verbatim
 * with nothing left for the auto/nudge machinery to decide.
 */
describe('full-auto and full-manual are degenerate cases of the one code path', () => {
  it('full-auto: every node unpinned, still zero overlaps', async () => {
    const model = await loadRepresentativeModel();
    const diagram = findSystemContext(model);
    if (!diagram.view) throw new Error('system-context fixture should resolve a single view');

    const positioned = await layoutDiagram({
      nodes: diagram.view.nodes,
      edges: diagram.view.edges,
      layout: null,
    });

    expect(positioned.nodes.length).toBeGreaterThan(0);
    expect(positioned.nodes.every((node) => !node.pinned)).toBe(true);
    assertNoOverlaps(positioned.nodes);
  });

  it('full-manual: every node pinned, positions taken verbatim with zero overlaps', async () => {
    const model = await loadRepresentativeModel();
    const diagram = findSystemContext(model);
    if (!diagram.view) throw new Error('system-context fixture should resolve a single view');

    // A hand-authored full-manual layout, deliberately laid out on a grid
    // unrelated to anything elkjs would have chosen — proving the pins win
    // outright, not just "close to" what auto-layout picked.
    // The system-context diagram never authors `__system__` as a node entry,
    // so it resolves to an injected node under the system's real slug
    // (`main-system`) — see `resolveSystemAliasRef`'s doc comment. A
    // `.layout/` file pins it under either identifier; this one uses the
    // real slug directly, just to prove that path works too.
    const layout: Layout = {
      version: 1,
      nodes: {
        architect: { x: 0, y: 0, width: 300, height: 110 },
        'main-system': { x: 500, y: 0, width: 300, height: 110 },
        'payment-gateway': { x: 1000, y: 0, width: 300, height: 110 },
      },
      edges: {},
    };

    const positioned = await layoutDiagram({
      nodes: diagram.view.nodes,
      edges: diagram.view.edges,
      layout,
    });

    expect(positioned.nodes.every((node) => node.pinned)).toBe(true);
    const byId = new Map(positioned.nodes.map((node) => [node.nodeId, node]));
    expect(byId.get('architect')).toMatchObject({ x: 0, y: 0, width: 300, height: 110 });
    expect(byId.get('main-system')).toMatchObject({ x: 500, y: 0, width: 300, height: 110 });
    expect(byId.get('payment-gateway')).toMatchObject({ x: 1000, y: 0, width: 300, height: 110 });

    assertNoOverlaps(positioned.nodes);
  });
});
