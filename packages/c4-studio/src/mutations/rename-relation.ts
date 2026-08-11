import type { C4FileSource } from '@workspec/c4-model';
import { loadDiagramDoc, persistDiagramDoc } from './diagram-doc.js';
import { mutationError, mutationOk } from './mutation-result.js';
import type { MutationResult } from './mutation-result.js';
import type { RenameRelationRequest } from './rename-relation-request.js';
import type { YamlSourceEdit } from './yaml-source-edit.js';

/** What `renameRelation` reports back on success. */
export interface RenamedRelation {
  readonly diagram: string;
  /** How many edges (normally one) carried the pair and were re-labelled. */
  readonly updated: number;
}

/**
 * Re-labels the edge(s) between `(from, to)` on a diagram. Edge identity
 * is the endpoint pair (the schema has no edge ids — see
 * `renameRelationRequestSchema`), so every matching edge is updated; an
 * empty label deletes the `label` key rather than writing `label: ""`.
 * Only the label lines move — the surgical Document edit leaves the rest
 * of the file byte-identical.
 */
export async function renameRelation(
  source: C4FileSource,
  request: RenameRelationRequest,
): Promise<MutationResult<RenamedRelation>> {
  const loaded = await loadDiagramDoc(source, request.diagram);
  if (!loaded.ok) return loaded;
  const diagram = loaded.value;

  const matches: number[] = [];
  diagram.data.edges.forEach((edge, index) => {
    if (edge.from === request.from && edge.to === request.to) matches.push(index);
  });
  if (matches.length === 0) {
    return mutationError(
      404,
      `diagram "${diagram.slug}" has no edge ${request.from} -> ${request.to}`,
    );
  }

  const edits: YamlSourceEdit[] = matches.map((index) =>
    request.label === ''
      ? { op: 'remove-item-field', seq: 'edges', index, key: 'label' }
      : { op: 'set-item-field', seq: 'edges', index, key: 'label', value: request.label },
  );

  const persisted = await persistDiagramDoc(source, diagram, edits);
  if (!persisted.ok) return persisted;
  return mutationOk({ diagram: diagram.slug, updated: matches.length });
}
