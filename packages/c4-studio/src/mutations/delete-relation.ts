import type { C4FileSource } from '@workspec/c4-model';
import type { DeleteRelationRequest } from './delete-relation-request.js';
import { loadDiagramDoc, persistDiagramDoc } from './diagram-doc.js';
import { scrubLayoutRefs } from './layout-scrub.js';
import { mutationError, mutationOk } from './mutation-result.js';
import type { MutationResult } from './mutation-result.js';
import { readSystemSlug } from './read-system-slug.js';
import { relationEndpointMatches } from './relation-endpoint-matches.js';

/** What `deleteRelation` reports back on success. */
export interface DeletedRelation {
  readonly diagram: string;
  /** How many edges (normally one) carried the pair and were removed. */
  readonly removed: number;
}

/**
 * Removes every edge between `(from, to)` on a diagram (pair identity —
 * see `renameRelationRequestSchema`), then scrubs the pair's `.layout/`
 * routing hint so the layout join doesn't report an orphan hint on the
 * next load. The node entries and every other edge are untouched.
 *
 * Endpoints match through {@link relationEndpointMatches} (a request may
 * name the system's real slug where the file wrote `__system__`), and the
 * layout hints scrubbed are keyed off what each removed edge ACTUALLY
 * authored — `.layout/` hints follow the file's spelling, not the
 * request's.
 */
export async function deleteRelation(
  source: C4FileSource,
  request: DeleteRelationRequest,
): Promise<MutationResult<DeletedRelation>> {
  const loaded = await loadDiagramDoc(source, request.diagram);
  if (!loaded.ok) return loaded;
  const diagram = loaded.value;

  const systemSlug = await readSystemSlug(source);
  const matches: number[] = [];
  const hintKeys: string[] = [];
  diagram.data.edges.forEach((edge, index) => {
    if (
      relationEndpointMatches(edge.from, request.from, systemSlug) &&
      relationEndpointMatches(edge.to, request.to, systemSlug)
    ) {
      matches.push(index);
      hintKeys.push(`${edge.from}->${edge.to}`);
    }
  });
  if (matches.length === 0) {
    return mutationError(
      404,
      `diagram "${diagram.slug}" has no edge ${request.from} -> ${request.to}`,
    );
  }

  // Source splices are resolved against ONE parse and applied together, so
  // indexes never shift under one another — no descending-order dance.
  const persisted = await persistDiagramDoc(
    source,
    diagram,
    matches.map((index) => ({ op: 'remove-item', seq: 'edges', index })),
  );
  if (!persisted.ok) return persisted;
  await scrubLayoutRefs(source, diagram.slug, { edges: hintKeys });
  return mutationOk({ diagram: diagram.slug, removed: matches.length });
}
