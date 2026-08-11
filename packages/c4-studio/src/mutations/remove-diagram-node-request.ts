import { z } from 'zod';
import { relationEndpointField } from './relation-endpoint-field.js';
import { slugField } from './slug-field.js';

/**
 * Schema for `DELETE /api/diagram-nodes`: remove a node ref from ONE
 * diagram (plus its touching edges and that diagram's layout pins/hints)
 * WITHOUT deleting the element file — the canvas node-delete gesture's
 * semantics (enterprise parity, A2 review lead ruling). The tree-wide
 * element delete is `DELETE /api/elements` and is reserved for the
 * explicit "delete element everywhere" action.
 *
 * `node` is the ref as the diagram authored it (bare/typed slug or fat
 * `id`); the `__system__` alias is accepted for the rare diagram that
 * authors an explicit `__system__` node entry.
 */
export const removeDiagramNodeRequestSchema = z.strictObject({
  diagram: slugField,
  node: relationEndpointField,
});

/** Inferred request type — always derived, never hand-written. */
export type RemoveDiagramNodeRequest = z.infer<typeof removeDiagramNodeRequestSchema>;
