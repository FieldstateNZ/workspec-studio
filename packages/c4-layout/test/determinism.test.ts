import { describe, expect, it } from 'vitest';
import { layoutDiagram } from '../src/layout-diagram.js';
import { findSystemContext, loadRepresentativeModel } from './helpers/load-representative-model.js';

/**
 * Determinism is a hard requirement (see the S4 design brief): identical
 * input must produce identical output coordinates, forever. `layoutDiagram`
 * constructs a fresh `ELK` instance on every call (see
 * `src/elk/run-auto-layout.ts`), so simply calling it twice already
 * exercises "across two separate ELK instances" — there is no shared
 * instance state that could be (accidentally) the thing making repeat runs
 * agree.
 */
describe('layoutDiagram determinism', () => {
  it('produces identical coordinates across repeat calls, including its own pinned nodes', async () => {
    const model = await loadRepresentativeModel();
    const diagram = findSystemContext(model);
    if (!diagram.view) throw new Error('system-context fixture should resolve a single view');

    const input = { nodes: diagram.view.nodes, edges: diagram.view.edges, layout: diagram.layout?.data ?? null };

    const first = await layoutDiagram(input);
    const second = await layoutDiagram(input);

    expect(second).toStrictEqual(first);
  });

  it('produces identical coordinates for a diagram with no .layout/ file at all (full-auto)', async () => {
    const model = await loadRepresentativeModel();
    const container = model.diagrams.find((d) => d.slug === 'container');
    if (!container?.lensViews) throw new Error('container fixture should be lens-partitioned');
    expect(container.layout).toBeNull();

    const input = { nodes: container.lensViews.logical.nodes, edges: container.lensViews.logical.edges, layout: null };

    const first = await layoutDiagram(input);
    const second = await layoutDiagram(input);

    expect(second).toStrictEqual(first);
  });
});
