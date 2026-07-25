import type { Layout, LayoutRectType } from '@workspec/topology-schema';
import type { LensEntry, LensPosition, LensTree } from '../model/lens-tree.types.js';

function toLensPosition(rect: LayoutRectType | undefined): LensPosition | null {
  if (!rect) return null;
  return { x: rect.x, y: rect.y, width: rect.width ?? null, height: rect.height ?? null };
}

function joinEntry(entry: LensEntry, layout: Layout | null, lens: 'network' | 'rg'): LensEntry {
  if (entry.type === 'node') {
    const position = toLensPosition(layout?.nodes[entry.node.slug]?.positions[lens]);
    return { type: 'node', node: { ...entry.node, position } };
  }

  const position = toLensPosition(layout?.nodes[entry.container.slug]?.positions[lens]);
  return {
    type: 'container',
    container: {
      ...entry.container,
      position,
      children: entry.container.children.map((child) => joinEntry(child, layout, lens)),
    },
  };
}

/**
 * Attaches each entry's pinned position from the tree's `.layout/` file
 * (already validated and orphan-checked at load time by
 * `joinLayoutToModel`), for the lens `tree` was built for. Pure enrichment,
 * no diagnostics: an entry with no matching `layout.nodes` key, or with that
 * key's `positions[lens]` absent, simply keeps `position: null` — this is
 * the normal case for most resources (auto-layout), not an error. A
 * resolved environment naturally has fewer resources than the model's full
 * layout accounts for (pruned-out resources' pinned positions are just
 * unused this cycle); that isn't an orphan either — orphans are checked
 * once, at load time, against every resource the tree has ever authored,
 * not per-environment.
 */
export function joinPositionsToLensTree(tree: LensTree, layout: Layout | null): LensTree {
  return { ...tree, roots: tree.roots.map((entry) => joinEntry(entry, layout, tree.lens)) };
}
