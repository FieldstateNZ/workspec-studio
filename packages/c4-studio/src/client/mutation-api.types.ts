// The browser-side contract of the host server's write API
// (`mutations/mutation-router.ts`). Every input/output type is imported
// TYPE-ONLY from the server modules themselves — the zod schemas are the
// single source of truth and the client can never drift from them — and
// the imports erase at build time, so no server code reaches the bundle.

import type { CreateElementRequest } from '../mutations/create-element-request.js';
import type { CreatedElement } from '../mutations/create-element.js';
import type { CreateRelationRequest } from '../mutations/create-relation-request.js';
import type { CreatedRelation } from '../mutations/create-relation.js';
import type { DeleteElementRequest } from '../mutations/delete-element-request.js';
import type { DeletedElement } from '../mutations/delete-element.js';
import type { DeleteRelationRequest } from '../mutations/delete-relation-request.js';
import type { DeletedRelation } from '../mutations/delete-relation.js';
import type { RemoveDiagramNodeRequest } from '../mutations/remove-diagram-node-request.js';
import type { RemovedDiagramNode } from '../mutations/remove-diagram-node.js';
import type { RenameRelationRequest } from '../mutations/rename-relation-request.js';
import type { RenamedRelation } from '../mutations/rename-relation.js';
import type { UpdateElementRequest } from '../mutations/update-element-request.js';
import type { UpdatedElement } from '../mutations/update-element.js';

/**
 * The write API, one method per route. Every method resolves with the
 * server's success payload or rejects with an `Error` whose message is the
 * server's diagnostic (`{ error }` body when present, else the HTTP
 * status) — the message the shell's write-error banner shows verbatim.
 * Implemented by `createMutationApi` (fetch-backed); tests substitute a
 * hand-rolled fake, which is why this lives in its own `*.types.ts`.
 */
export interface MutationApi {
  /** `POST /api/elements` — create an element file (+ optional diagram drop). */
  createElement(input: CreateElementRequest): Promise<CreatedElement>;
  /** `PATCH /api/elements` — update fields / rename (title only; slug stable). */
  updateElement(input: UpdateElementRequest): Promise<UpdatedElement>;
  /**
   * `DELETE /api/elements` — delete the element file EVERYWHERE (+ scrub
   * dangling refs tree-wide). Destructive: reserve for the explicit
   * "delete element everywhere" action (A3 surfaces it with a
   * confirmation); the canvas gesture is {@link removeDiagramNode}.
   */
  deleteElement(input: DeleteElementRequest): Promise<DeletedElement>;
  /**
   * `DELETE /api/diagram-nodes` — remove a node ref from ONE diagram (+
   * its touching edges and that diagram's layout pins/hints), leaving the
   * element file intact. The canvas node-delete gesture's semantics.
   */
  removeDiagramNode(input: RemoveDiagramNodeRequest): Promise<RemovedDiagramNode>;
  /** `POST /api/relations` — append a diagram edge. */
  createRelation(input: CreateRelationRequest): Promise<CreatedRelation>;
  /** `PATCH /api/relations` — re-label the (from, to) edge(s). */
  renameRelation(input: RenameRelationRequest): Promise<RenamedRelation>;
  /** `DELETE /api/relations` — remove the (from, to) edge(s) + layout hint. */
  deleteRelation(input: DeleteRelationRequest): Promise<DeletedRelation>;
  /**
   * Resets a diagram's `.layout/` file to "no pins" through the existing
   * `PUT /api/file` route — the file-backed meaning of auto-layout: with
   * every pin gone, the next model load lays the diagram out fresh.
   */
  clearLayout(diagramSlug: string): Promise<void>;
}
