import { z } from 'zod';
import { elementKindField } from './element-kind-field.js';
import { slugField } from './slug-field.js';

/**
 * Schema for `POST /api/elements`: create a new element file (and,
 * optionally, drop it onto a diagram in the same call — the palette's
 * place-then-name flow needs both or the created element would never
 * appear on the canvas that created it).
 *
 * `name` is the free-text title the user typed; the server slugifies it
 * into the filename (see `createElement` for the slug-stability contract).
 * `technology` is only legal for the four `TECHNOLOGY_KINDS`; the service
 * rejects it elsewhere with a clearer message than the schema's `.strict()`
 * would. `diagram`/`position` pin the new element onto an existing diagram:
 * a typed-ref node appended to the diagram file plus a `.layout/` position
 * pin.
 */
export const createElementRequestSchema = z.strictObject({
  kind: elementKindField,
  name: z.string().min(1).max(200),
  description: z.string().max(4000).optional(),
  technology: z.string().max(200).optional(),
  tags: z.array(z.string().min(1).max(100)).max(50).optional(),
  diagram: slugField.optional(),
  position: z.strictObject({ x: z.number().finite(), y: z.number().finite() }).optional(),
});

/** Inferred request type — always derived, never hand-written. */
export type CreateElementRequest = z.infer<typeof createElementRequestSchema>;
