import { describe, expect, it } from 'vitest';
import type { LensContainer, LensEntry, LensNode } from '@workspec/topology-model';
import type { Rect } from './rect.js';
import { contentBounds, layoutLensTree } from './fallback-layout.js';

/** Asserts a rect was found for `slug` and narrows to it — avoids a banned non-null assertion at every call site below. */
function requireRect(rects: ReadonlyMap<string, Rect>, slug: string): Rect {
  const rect = rects.get(slug);
  expect(rect).toBeDefined();
  if (!rect) throw new Error(`no rect for "${slug}"`);
  return rect;
}

function node(slug: string): LensEntry {
  const lensNode: LensNode = { slug, kind: 'compute', name: slug, position: null };
  return { type: 'node', node: lensNode };
}

function container(slug: string, children: readonly LensEntry[]): LensEntry {
  const lensContainer: LensContainer = { slug, kind: 'vnet', name: slug, position: null, children };
  return { type: 'container', container: lensContainer };
}

describe('layoutLensTree', () => {
  it('lays out every node in a flat root list, never crashing on an empty tree', () => {
    expect(layoutLensTree([])).toEqual(new Map());
  });

  it('gives every top-level node a distinct, non-overlapping x lane', () => {
    const rects = layoutLensTree([node('a'), node('b')]);
    const a = requireRect(rects, 'a');
    const b = requireRect(rects, 'b');
    expect(b.x).toBeGreaterThanOrEqual(a.x + a.width);
  });

  it('never crashes on a node with no pinned position — every entry still gets a rect', () => {
    const rects = layoutLensTree([node('lonely')]);
    expect(rects.get('lonely')).toBeDefined();
  });

  it('sizes a container to enclose its stacked children, and nests them inside its box', () => {
    const tree = [container('vnet1', [node('a'), node('b')])];
    const rects = layoutLensTree(tree);
    const outer = requireRect(rects, 'vnet1');
    const a = requireRect(rects, 'a');
    const b = requireRect(rects, 'b');

    // Both children sit within the container's horizontal extent.
    expect(a.x).toBeGreaterThanOrEqual(outer.x);
    expect(a.x + a.width).toBeLessThanOrEqual(outer.x + outer.width);
    // Children are stacked vertically, not overlapping.
    expect(b.y).toBeGreaterThanOrEqual(a.y + a.height);
    // The container encloses both children vertically.
    expect(outer.y + outer.height).toBeGreaterThanOrEqual(b.y + b.height);
  });

  it('recurses through nested containers (vnet > subnet > node)', () => {
    const tree = [container('vnet1', [container('subnet1', [node('leaf')])])];
    const rects = layoutLensTree(tree);
    expect(rects.get('vnet1')).toBeDefined();
    expect(rects.get('subnet1')).toBeDefined();
    expect(rects.get('leaf')).toBeDefined();
  });

  it('honours an authored position over the auto cursor', () => {
    const pinnedNode: LensNode = {
      slug: 'pinned',
      kind: 'compute',
      name: 'pinned',
      position: { x: 500, y: 500, width: 200, height: 80 },
    };
    const rects = layoutLensTree([{ type: 'node', node: pinnedNode }]);
    expect(rects.get('pinned')).toEqual({ x: 500, y: 500, width: 200, height: 80 });
  });
});

describe('contentBounds', () => {
  it('computes the bounding box (plus margin) of a set of rects', () => {
    const rects = new Map([
      ['a', { x: 0, y: 0, width: 100, height: 50 }],
      ['b', { x: 150, y: 20, width: 100, height: 50 }],
    ]);
    const bounds = contentBounds(rects);
    expect(bounds.width).toBeGreaterThan(250);
    expect(bounds.height).toBeGreaterThan(70);
  });

  it('never crashes on an empty rect map', () => {
    expect(() => contentBounds(new Map())).not.toThrow();
  });
});
