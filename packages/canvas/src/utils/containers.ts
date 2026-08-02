import type { Shape, ShapeId } from '../types.js';

/**
 * Every shape nested under `id` at any depth via the generic `containerId`
 * parent link (the whole subtree, excluding `id` itself). Used to move a
 * container's contents with it and to keep a group out of its own subtree
 * when re-parenting. Inert on canvases that never set containerId.
 */
export function containerDescendants(id: ShapeId, shapes: Record<ShapeId, Shape>): Set<ShapeId> {
  const out = new Set<ShapeId>();
  const walk = (parent: ShapeId): void => {
    for (const s of Object.values(shapes)) {
      if (s.containerId === parent && !out.has(s.id)) {
        out.add(s.id);
        walk(s.id);
      }
    }
  };
  walk(id);
  return out;
}

/**
 * Expand a set of shape ids to include every containment descendant —
 * the multi-id companion to containerDescendants. Move and delete use
 * this so a container carries its children without double-moving ones
 * that were independently selected.
 */
export function withDescendants(shapes: Record<ShapeId, Shape>, ids: ShapeId[]): ShapeId[] {
  const result = new Set<ShapeId>(ids);
  const childrenOf = new Map<string, ShapeId[]>();
  for (const s of Object.values(shapes)) {
    if (!s.containerId) continue;
    const list = childrenOf.get(s.containerId);
    if (list) list.push(s.id);
    else childrenOf.set(s.containerId, [s.id]);
  }
  const queue = [...ids];
  for (let id = queue.pop(); id !== undefined; id = queue.pop()) {
    for (const child of childrenOf.get(id) ?? []) {
      if (!result.has(child)) {
        result.add(child);
        queue.push(child);
      }
    }
  }
  return [...result];
}
