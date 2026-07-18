import { z } from 'zod';
import { JSON_SCHEMA_DIALECT } from '../constants.js';
import { sortJsonKeys } from './sort-json-keys.js';

/**
 * Converts a Zod schema to a draft 2020-12 JSON Schema document, stamping
 * on the `$id` and `title` every committed schema-core schema carries, and
 * sorting keys for byte-stable regeneration. This is the one place
 * `z.toJSONSchema` is called — same shape as
 * `@workspec/c4-schema`'s `buildJsonSchema`. Uses `io: 'input'` because the
 * committed schemas describe what authors *write*: fields with a Zod
 * `.default(...)` must not be marked `required` in the editor-facing schema.
 */
export function buildJsonSchema(schema: z.ZodType, id: string, title: string): unknown {
  const body = z.toJSONSchema(schema, {
    target: 'draft-2020-12',
    io: 'input',
  }) as Record<string, unknown>;
  delete body.$schema;
  return sortJsonKeys({
    $schema: JSON_SCHEMA_DIALECT,
    $id: id,
    title,
    ...body,
  });
}
