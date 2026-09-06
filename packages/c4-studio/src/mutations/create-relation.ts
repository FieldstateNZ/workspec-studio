import { SYSTEM_ALIAS } from '@workspec/c4-schema';
import type { C4FileSource } from '@workspec/c4-model';
import type { CreateRelationRequest } from './create-relation-request.js';
import { diagramNodeRef } from './diagram-node-ref.js';
import { loadDiagramDoc, persistDiagramDoc } from './diagram-doc.js';
import { mutationError, mutationOk } from './mutation-result.js';
import type { MutationResult } from './mutation-result.js';
import { readSystemSlug } from './read-system-slug.js';
import { relationEndpointMatches } from './relation-endpoint-matches.js';

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
 *
 * THE SYSTEM CARD. The canvas names endpoints by the slugs the RESOLVER
 * produced, and the resolver rewrites `__system__` to the system element's
 * real slug — so drawing a connector to the system card asks for
 * `to: "workspec-studio"` on a diagram whose only expression of that node
 * is the alias (it has no node entry: the resolver injected one). Such an
 * endpoint is canonicalised back to `__system__` before anything is
 * written, which is both the form the file can express and the form its
 * existing edges use — so the duplicate check sees the collision it should
 * (409, not a second edge that projects onto the same connector).
 */
export async function createRelation(
  source: C4FileSource,
  request: CreateRelationRequest,
): Promise<MutationResult<CreatedRelation>> {
  const loaded = await loadDiagramDoc(source, request.diagram);
  if (!loaded.ok) return loaded;
  const diagram = loaded.value;

  const systemSlug = await readSystemSlug(source);
  const nodeRefs = new Set(diagram.data.nodes.map((n) => diagramNodeRef(n).slug));
  nodeRefs.add(SYSTEM_ALIAS);
  const authored: Record<'from' | 'to', string> = { from: request.from, to: request.to };
  for (const field of ['from', 'to'] as const) {
    const endpoint = request[field];
    if (nodeRefs.has(endpoint)) continue;
    if (systemSlug !== null && endpoint === systemSlug) {
      authored[field] = SYSTEM_ALIAS;
      continue;
    }
    return mutationError(
      400,
      `"${field}" endpoint "${endpoint}" is not a node of diagram "${diagram.slug}"`,
    );
  }

  if (
    diagram.data.edges.some(
      (e) =>
        relationEndpointMatches(e.from, authored.from, systemSlug) &&
        relationEndpointMatches(e.to, authored.to, systemSlug),
    )
  ) {
    return mutationError(
      409,
      `diagram "${diagram.slug}" already has an edge ${authored.from} -> ${authored.to}`,
    );
  }

  const edge = {
    from: authored.from,
    to: authored.to,
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
  // Report what was WRITTEN, not what was asked for — the caller's next
  // read of the file has to be able to find this edge.
  return mutationOk({ diagram: diagram.slug, from: authored.from, to: authored.to });
}
