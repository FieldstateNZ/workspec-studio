import { z } from 'zod';
import { relationEndpointField } from './relation-endpoint-field.js';
import { slugField } from './slug-field.js';

/**
 * Schema for `PATCH /api/relations`: re-label the edge(s) between two
 * endpoints. Edges have no id in the schema — their identity at both the
 * canvas seam (`renameEdge(fromKey, toKey, label)`) and the file level is
 * the `(from, to)` pair — so a rename addresses the pair and updates every
 * matching edge (a hand-authored diagram may carry parallel edges split by
 * `lens`; they share a label the same way `.layout/` has them share a
 * routing hint). An empty `label` clears the label key entirely.
 */
export const renameRelationRequestSchema = z.strictObject({
  diagram: slugField,
  from: relationEndpointField,
  to: relationEndpointField,
  label: z.string().max(300),
});

/** Inferred request type — always derived, never hand-written. */
export type RenameRelationRequest = z.infer<typeof renameRelationRequestSchema>;
