import { z } from 'zod';
import { elementKindField } from './element-kind-field.js';
import { slugField } from './slug-field.js';

/**
 * Schema for `DELETE /api/elements`: remove an element file and scrub the
 * references that would otherwise dangle (see `deleteElement` for the
 * exact scrub rules). `kind` disambiguates when more than one type
 * directory bears the slug; without it, an ambiguous slug is refused (409)
 * rather than guessed at — deletion is the one mutation a wrong guess
 * can't undo.
 */
export const deleteElementRequestSchema = z.strictObject({
  slug: slugField,
  kind: elementKindField.optional(),
});

/** Inferred request type — always derived, never hand-written. */
export type DeleteElementRequest = z.infer<typeof deleteElementRequestSchema>;
