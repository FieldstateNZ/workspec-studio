import type { ResolvedDiagramEdge } from '@workspec/c4-model';
import { edgeKey } from './edge-key.js';

/**
 * Sorts edges by their `.layout/`-hint key (`"<from>-><to>"`), falling back
 * to the stable original order for parallel edges sharing a key — same
 * determinism rationale as `sortNodesById`, and ordinal comparison for the
 * same reason (no `localeCompare`).
 */
export function sortEdgesByKey(edges: readonly ResolvedDiagramEdge[]): readonly ResolvedDiagramEdge[] {
  return [...edges].sort((a, b) => {
    const ka = edgeKey(a);
    const kb = edgeKey(b);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
}
