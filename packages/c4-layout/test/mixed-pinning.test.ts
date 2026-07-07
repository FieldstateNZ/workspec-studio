import { describe, expect, it } from 'vitest';
import { layoutDiagram } from '../src/layout-diagram.js';
import { assertNoOverlaps } from './helpers/assert-no-overlaps.js';
import { findSystemContext, loadRepresentativeModel } from './helpers/load-representative-model.js';

/**
 * The representative fixture's `system-context` diagram is the mixed-mode
 * case: its `.layout/system-context.yaml` pins `architect` (240x120,
 * explicit size) and `__system__` (default size, no width/height given),
 * but its third node — `payment-gateway`, an `external-system` ref — is
 * unpinned. This is exactly the "pin a subset, prove the rest auto-lays
 * around it, collision-free" contract from the S4 design brief.
 *
 * The system-context diagram never authors `__system__` as a node entry
 * (only its edges reference the alias), so `@workspec/c4-model` injects it
 * under its *real* slug (`main-system` — see `inject-system-node.ts`), not
 * the literal `__system__`; the `.layout/` file's `__system__` key is
 * translated to that real id before matching (see
 * `resolveSystemAliasRef`), which is what this test is really proving.
 */
describe('mixed pinned/auto layout', () => {
  it('places pinned nodes exactly as authored and the auto node collision-free around them', async () => {
    const model = await loadRepresentativeModel();
    const diagram = findSystemContext(model);
    if (!diagram.view) throw new Error('system-context fixture should resolve a single view');
    const layout = diagram.layout?.data ?? null;
    expect(layout).not.toBeNull();

    const positioned = await layoutDiagram({ nodes: diagram.view.nodes, edges: diagram.view.edges, layout });

    expect(positioned.nodes).toHaveLength(3);
    const byId = new Map(positioned.nodes.map((node) => [node.nodeId, node]));

    const architect = byId.get('architect');
    expect(architect).toMatchObject({ x: 80, y: 200, width: 240, height: 120, pinned: true });

    const system = byId.get('main-system');
    // No width/height authored for __system__ in the fixture's .layout/ —
    // the default C4 node footprint applies.
    expect(system).toMatchObject({ x: 400, y: 200, width: 300, height: 110, pinned: true });

    const paymentGateway = byId.get('payment-gateway');
    expect(paymentGateway?.pinned).toBe(false);
    expect(paymentGateway?.width).toBe(300);
    expect(paymentGateway?.height).toBe(110);

    assertNoOverlaps(positioned.nodes);
  });

  it('degrades to full-auto placement (still collision-free) when the .layout/ file is absent', async () => {
    const model = await loadRepresentativeModel();
    const diagram = findSystemContext(model);
    if (!diagram.view) throw new Error('system-context fixture should resolve a single view');

    const positioned = await layoutDiagram({ nodes: diagram.view.nodes, edges: diagram.view.edges, layout: null });

    expect(positioned.nodes.every((node) => !node.pinned)).toBe(true);
    assertNoOverlaps(positioned.nodes);
  });
});
