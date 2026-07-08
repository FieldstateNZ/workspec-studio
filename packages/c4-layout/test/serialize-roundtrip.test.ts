import { describe, expect, it } from 'vitest';
import { Layout } from '@workspec/c4-schema';
import { layoutDiagram } from '../src/layout-diagram.js';
import { serialize } from '../src/serialize.js';
import { geometryOf } from './helpers/geometry-snapshot.js';
import {
  findContainer,
  findSystemContext,
  loadRepresentativeModel,
} from './helpers/load-representative-model.js';

/**
 * `serialize` is how a team graduates auto-layout to a curated `.layout/`
 * file: run `layoutDiagram` once, `serialize` the result, write it to disk.
 * Two things must hold for that graduation to be trustworthy: the written
 * shape must actually validate against `@workspec/c4-schema`'s `Layout`
 * schema (so it can be read back by anything else that reads `.layout/`
 * files), and feeding it straight back into `layoutDiagram` must reproduce
 * the exact same positions — otherwise "curated" would silently drift on
 * every reload.
 */
describe('serialize round-trip', () => {
  it('validates against the c4-schema Layout schema', async () => {
    const model = await loadRepresentativeModel();
    const diagram = findSystemContext(model);
    if (!diagram.view) throw new Error('system-context fixture should resolve a single view');

    const positioned = await layoutDiagram({
      nodes: diagram.view.nodes,
      edges: diagram.view.edges,
      layout: diagram.layout?.data ?? null,
    });

    const layout = serialize(positioned);

    expect(() => Layout.parse(layout)).not.toThrow();
    expect(layout.version).toBe(1);
    expect(Object.keys(layout.nodes)).toHaveLength(positioned.nodes.length);
  });

  it('reproduces identical positions when fed back into layoutDiagram (mixed-mode fixture)', async () => {
    const model = await loadRepresentativeModel();
    const diagram = findSystemContext(model);
    if (!diagram.view) throw new Error('system-context fixture should resolve a single view');

    const first = await layoutDiagram({
      nodes: diagram.view.nodes,
      edges: diagram.view.edges,
      layout: diagram.layout?.data ?? null,
    });

    const serialized = serialize(first);
    const second = await layoutDiagram({
      nodes: diagram.view.nodes,
      edges: diagram.view.edges,
      layout: serialized,
    });

    // Geometry must be pixel-identical; `pinned` legitimately flips to
    // `true` for the previously-auto `payment-gateway` node now that
    // `serialized` pins every node — that's graduation working as
    // designed, not a regression (see `geometryOf`'s doc comment).
    expect(geometryOf(second)).toStrictEqual(geometryOf(first));
    expect(second.nodes.every((node) => node.pinned)).toBe(true);
  });

  it('reproduces identical positions for a full-auto (no prior .layout/) diagram', async () => {
    const model = await loadRepresentativeModel();
    const container = findContainer(model);
    if (!container.lensViews) throw new Error('container fixture should be lens-partitioned');

    const first = await layoutDiagram({
      nodes: container.lensViews.logical.nodes,
      edges: container.lensViews.logical.edges,
      layout: null,
    });

    const serialized = serialize(first);
    const second = await layoutDiagram({
      nodes: container.lensViews.logical.nodes,
      edges: container.lensViews.logical.edges,
      layout: serialized,
    });

    expect(geometryOf(second)).toStrictEqual(geometryOf(first));
    expect(second.nodes.every((node) => node.pinned)).toBe(true);
  });
});
