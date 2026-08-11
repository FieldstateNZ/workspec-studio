import { DIAGRAM_EDGE_LENSES } from '@workspec/c4-schema';
import { z } from 'zod';
import { relationEndpointField } from './relation-endpoint-field.js';
import { slugField } from './slug-field.js';

/**
 * Schema for `POST /api/relations`: append one edge to a diagram's
 * `edges` array — the artifact that carries relations in the c4-schema
 * model (elements have no relation fields; edges live on diagrams).
 * `label`/`lens`/`category` mirror `DiagramEdge`'s optional fields
 * exactly, minus nothing: whatever the schema can express, the API can
 * author.
 */
export const createRelationRequestSchema = z.strictObject({
  diagram: slugField,
  from: relationEndpointField,
  to: relationEndpointField,
  label: z.string().min(1).max(300).optional(),
  lens: z.enum(DIAGRAM_EDGE_LENSES).optional(),
  category: z.string().min(1).max(100).optional(),
});

/** Inferred request type — always derived, never hand-written. */
export type CreateRelationRequest = z.infer<typeof createRelationRequestSchema>;
