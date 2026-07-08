import type { ResolvedDiagramNode } from '@workspec/c4-model';

/**
 * Sorts nodes by `nodeId` (stable, so nodes sharing an id — which never
 * happens in practice, `nodeId` is unique per view — keep their relative
 * order). This is the determinism anchor: elkjs's layered algorithm is
 * itself deterministic given identical input, but object/array iteration
 * order from upstream (YAML file read order, `Map` insertion order) is not
 * guaranteed to be stable across a tree re-load — sorting here removes that
 * variable before anything is handed to ELK.
 *
 * Ordinal comparison (`<`/`>`), not `localeCompare` — `localeCompare`'s
 * result depends on the runtime's default locale/ICU data, which is exactly
 * the kind of environment-dependence the determinism requirement rules out.
 */
export function sortNodesById(
  nodes: readonly ResolvedDiagramNode[],
): readonly ResolvedDiagramNode[] {
  return [...nodes].sort((a, b) => (a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0));
}
