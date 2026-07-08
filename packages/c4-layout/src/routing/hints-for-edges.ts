import type { Layout, LayoutEdge as LayoutEdgeHint } from '@workspec/c4-schema';
import type { ResolvedDiagramEdge, ResolvedDiagramNode } from '@workspec/c4-model';
import { edgeKey } from '../sorting/edge-key.js';
import { resolveSystemAliasRef } from '../model/resolve-system-alias-ref.js';

/** Splits a `"<from>-><to>"` layout key back into its two raw (as-authored) halves. */
function splitEdgeKey(key: string): { readonly from: string; readonly to: string } | null {
  const arrowIndex = key.indexOf('->');
  if (arrowIndex === -1) return null;
  return { from: key.slice(0, arrowIndex), to: key.slice(arrowIndex + 2) };
}

/**
 * The subset of a `.layout/` file's `edges` that actually key one of this
 * view's edges, re-keyed by the *resolved* `"<from>-><to>"` (a raw
 * `__system__` on either side is translated to the injected system node's
 * real `nodeId` first — same gap `pinsForNodes` closes, see
 * `resolveSystemAliasRef`). Same "ignore, don't re-diagnose" rule as
 * `pinsForNodes` for an unmatched key — `@workspec/c4-model` already flags
 * it as `orphan-layout-edge-hint`.
 */
export function hintsForEdges(
  layout: Layout | null,
  edges: readonly ResolvedDiagramEdge[],
  nodes: readonly ResolvedDiagramNode[],
): ReadonlyMap<string, LayoutEdgeHint> {
  const hints = new Map<string, LayoutEdgeHint>();
  if (!layout?.edges) return hints;

  const knownKeys = new Set(edges.map((edge) => edgeKey(edge)));
  for (const [rawKey, hint] of Object.entries(layout.edges)) {
    const split = splitEdgeKey(rawKey);
    if (!split) continue;
    const resolvedKey = `${resolveSystemAliasRef(split.from, nodes)}->${resolveSystemAliasRef(split.to, nodes)}`;
    if (knownKeys.has(resolvedKey)) hints.set(resolvedKey, hint);
  }
  return hints;
}
