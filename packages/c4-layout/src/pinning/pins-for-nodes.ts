import type { Layout, LayoutNode as LayoutNodePin } from '@workspec/c4-schema';
import type { ResolvedDiagramNode } from '@workspec/c4-model';
import { resolveSystemAliasRef } from '../model/resolve-system-alias-ref.js';

/**
 * The subset of a `.layout/` file's `nodes` that actually pin a node in
 * this view, keyed by `nodeId` (not by the file's own key — a `__system__`
 * key is translated to the injected system node's real `nodeId` first, see
 * `resolveSystemAliasRef`). A key with no matching node after that
 * translation (renamed or removed element, or a pin authored for the other
 * lens of a `c4-container` diagram) is silently ignored here —
 * `@workspec/c4-model` already raised an `orphan-layout-node` diagnostic
 * for it at load time; this package isn't the place to raise it again.
 */
export function pinsForNodes(
  layout: Layout | null,
  nodes: readonly ResolvedDiagramNode[],
): ReadonlyMap<string, LayoutNodePin> {
  const pins = new Map<string, LayoutNodePin>();
  if (!layout) return pins;

  const knownIds = new Set(nodes.map((node) => node.nodeId));
  for (const [rawKey, pin] of Object.entries(layout.nodes)) {
    const nodeId = resolveSystemAliasRef(rawKey, nodes);
    if (knownIds.has(nodeId)) pins.set(nodeId, pin);
  }
  return pins;
}
