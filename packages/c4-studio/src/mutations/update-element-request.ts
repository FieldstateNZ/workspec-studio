import { z } from 'zod';
import { elementKindField } from './element-kind-field.js';
import { slugField } from './slug-field.js';

/**
 * Schema for `PATCH /api/elements`: update fields on an existing element.
 * Rename rides this route as `name` — it updates the YAML `title:` only;
 * the slug (and therefore the filename and every diagram/layout reference)
 * is stable for the element's lifetime (see `updateElement`'s doc comment
 * for the full slug-stability rationale).
 *
 * `kind` is optional: when omitted the server locates the slug across all
 * nine type directories and refuses (409) if more than one kind bears it.
 * An empty-string `technology` deletes the key; an empty `tags` array
 * deletes the key — both keep authored files minimal rather than
 * accumulating empty stubs.
 */
export const updateElementRequestSchema = z
  .strictObject({
    slug: slugField,
    kind: elementKindField.optional(),
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(4000).optional(),
    technology: z.string().max(200).optional(),
    tags: z.array(z.string().min(1).max(100)).max(50).optional(),
  })
  .refine(
    (body) =>
      body.name !== undefined ||
      body.description !== undefined ||
      body.technology !== undefined ||
      body.tags !== undefined,
    { message: 'at least one of name/description/technology/tags is required' },
  );

/** Inferred request type — always derived, never hand-written. */
export type UpdateElementRequest = z.infer<typeof updateElementRequestSchema>;
