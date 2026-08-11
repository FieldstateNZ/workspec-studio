import { z } from 'zod';
import { relationEndpointField } from './relation-endpoint-field.js';
import { slugField } from './slug-field.js';

/**
 * Schema for `DELETE /api/relations`: remove every edge between two
 * endpoints (edge identity is the `(from, to)` pair — see
 * `renameRelationRequestSchema`'s doc comment), plus the pair's
 * `.layout/` routing hint so nothing orphans.
 */
export const deleteRelationRequestSchema = z.strictObject({
  diagram: slugField,
  from: relationEndpointField,
  to: relationEndpointField,
});

/** Inferred request type — always derived, never hand-written. */
export type DeleteRelationRequest = z.infer<typeof deleteRelationRequestSchema>;
