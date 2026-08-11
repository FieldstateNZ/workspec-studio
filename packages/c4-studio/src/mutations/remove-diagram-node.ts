import type { C4FileSource } from '@workspec/c4-model';
import { diagramNodeRef } from './diagram-node-ref.js';
import { loadDiagramDoc, persistDiagramDoc } from './diagram-doc.js';
import { scrubLayoutRefs } from './layout-scrub.js';
import { mutationError, mutationOk } from './mutation-result.js';
import type { MutationResult } from './mutation-result.js';
import type { RemoveDiagramNodeRequest } from './remove-diagram-node-request.js';
import type { YamlSourceEdit } from './yaml-source-edit.js';

/** What `removeDiagramNode` reports back on success. */
export interface RemovedDiagramNode {
  readonly diagram: string;
  readonly node: string;
  /** Node entries removed (normally one; duplicated refs all go). */
  readonly removedNodes: number;
  /** Edges removed because an endpoint referenced the node. */
  readonly removedEdges: number;
}

/**
 * Removes a node ref from ONE diagram: every node entry whose ref slug (or
 * fat `id`) matches, every edge whose `from`/`to` names it (the loader
 * resolves edge endpoints against the diagram's OWN nodes, so those edges
 * would dangle as error diagnostics the moment the ref goes — see
 * `resolveDiagramEdges`), and the diagram's `.layout/` pin + touching edge
 * hints. The element FILE is deliberately untouched: this is the canvas
 * node-delete gesture (diagram-scoped, enterprise parity); tree-wide
 * element deletion is `deleteElement`'s job.
 */
export async function removeDiagramNode(
  source: C4FileSource,
  request: RemoveDiagramNodeRequest,
): Promise<MutationResult<RemovedDiagramNode>> {
  const loaded = await loadDiagramDoc(source, request.diagram);
  if (!loaded.ok) return loaded;
  const diagram = loaded.value;

  const nodeIndexesToRemove: number[] = [];
  diagram.data.nodes.forEach((node, index) => {
    if (diagramNodeRef(node).slug === request.node) nodeIndexesToRemove.push(index);
  });
  if (nodeIndexesToRemove.length === 0) {
    return mutationError(404, `diagram "${diagram.slug}" has no node "${request.node}"`);
  }

  const removedEdgeKeys: string[] = [];
  const edgeIndexesToRemove: number[] = [];
  diagram.data.edges.forEach((edge, index) => {
    if (edge.from === request.node || edge.to === request.node) {
      edgeIndexesToRemove.push(index);
      removedEdgeKeys.push(`${edge.from}->${edge.to}`);
    }
  });

  // Source splices are resolved against ONE parse and applied together, so
  // indexes never shift under one another — no descending-order dance.
  const edits: YamlSourceEdit[] = [
    ...nodeIndexesToRemove.map((index) => ({ op: 'remove-item' as const, seq: 'nodes', index })),
    ...edgeIndexesToRemove.map((index) => ({ op: 'remove-item' as const, seq: 'edges', index })),
  ];

  const persisted = await persistDiagramDoc(source, diagram, edits);
  if (!persisted.ok) return persisted;
  await scrubLayoutRefs(source, diagram.slug, { nodes: [request.node], edges: removedEdgeKeys });

  return mutationOk({
    diagram: diagram.slug,
    node: request.node,
    removedNodes: nodeIndexesToRemove.length,
    removedEdges: edgeIndexesToRemove.length,
  });
}
