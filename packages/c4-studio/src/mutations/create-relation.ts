import { SYSTEM_ALIAS } from '@workspec/c4-schema';
import type { C4FileSource } from '@workspec/c4-model';
import type { CreateRelationRequest } from './create-relation-request.js';
import { diagramNodeRef } from './diagram-node-ref.js';
import { loadDiagramDoc, persistDiagramDoc } from './diagram-doc.js';
import { mutationError, mutationOk } from './mutation-result.js';
import type { MutationResult } from './mutation-result.js';

/** What `createRelation` reports back on success. */
export interface CreatedRelation {
  readonly diagram: string;
  readonly from: string;
  readonly to: string;
}

/**
 * Appends one edge to a diagram's `edges` array — the artifact that
 * carries relations in this model (elements have no relation fields).
 *
 * Both endpoints must be something the diagram already shows: one of its
 * own node refs, or the `__system__` alias (which diagrams routinely edge
 * against without a node entry — the resolver injects the system node).
 * Anything else would author a dangling edge the resolver can only warn
 * about. A second edge over the same `(from, to)` pair is refused (409):
 * pair identity is how the canvas seam (`renameEdge`/delete) and
 * `.layout/` hints address edges, so parallel pairs would become
 * unaddressable — authors who want lens-split parallels write them by
 * hand.
 */
export async function createRelation(
  source: C4FileSource,
  request: CreateRelationRequest,
): Promise<MutationResult<CreatedRelation>> {
  const loaded = await loadDiagramDoc(source, request.diagram);
  if (!loaded.ok) return loaded;
  const diagram = loaded.value;

  const nodeRefs = new Set(diagram.data.nodes.map((n) => diagramNodeRef(n).slug));
  nodeRefs.add(SYSTEM_ALIAS);
  for (const [field, endpoint] of [
    ['from', request.from],
    ['to', request.to],
  ] as const) {
    if (!nodeRefs.has(endpoint)) {
      return mutationError(
        400,
        `"${field}" endpoint "${endpoint}" is not a node of diagram "${diagram.slug}"`,
      );
    }
  }

  if (diagram.data.edges.some((e) => e.from === request.from && e.to === request.to)) {
    return mutationError(
      409,
      `diagram "${diagram.slug}" already has an edge ${request.from} -> ${request.to}`,
    );
  }

  const edge = {
    from: request.from,
    to: request.to,
    ...(request.label !== undefined ? { label: request.label } : {}),
    ...(request.lens !== undefined ? { lens: request.lens } : {}),
    ...(request.category !== undefined ? { category: request.category } : {}),
  };
  // `append-item` handles the absent / empty / flow-style `edges:` cases
  // itself, re-emitting the canonical block form rather than growing an
  // inline `[{...}]`.
  const persisted = await persistDiagramDoc(source, diagram, [
    { op: 'append-item', seq: 'edges', value: edge },
  ]);
  if (!persisted.ok) return persisted;
  return mutationOk({ diagram: diagram.slug, from: request.from, to: request.to });
}
