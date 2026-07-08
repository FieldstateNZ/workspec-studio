import type { DiagramEdge, FatDiagramNode, ThinDiagramNode } from '@workspec/c4-schema';
import { isSystemAlias } from './system-alias.js';
import { classifyThinNode } from './classify-thin-node.js';

/**
 * True if `__system__` appears anywhere in a diagram's authored nodes or
 * edges — used to decide whether a missing system element is a `no-system`
 * diagnostic (the alias was actually exercised) rather than simply
 * irrelevant to this diagram.
 */
export function usesSystemAlias(
  nodes: readonly (ThinDiagramNode | FatDiagramNode)[],
  edges: readonly DiagramEdge[],
): boolean {
  const nodeUsesAlias = nodes.some(
    (node) => !('id' in node) && isSystemAlias(classifyThinNode(node).slug),
  );
  const edgeUsesAlias = edges.some((edge) => isSystemAlias(edge.from) || isSystemAlias(edge.to));
  return nodeUsesAlias || edgeUsesAlias;
}
