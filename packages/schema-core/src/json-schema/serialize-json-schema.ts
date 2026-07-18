/**
 * Serializes a JSON Schema object to the exact byte format committed under
 * `json-schema/`: 2-space indent, a trailing newline, no trailing
 * whitespace. Both `scripts/gen-json-schema.ts` and the drift test must use
 * this so "regenerate in-memory" and "the committed file" are compared on
 * equal footing. Same implementation as `@workspec/c4-schema`'s
 * `serializeJsonSchema`.
 */
export function serializeJsonSchema(schema: unknown): string {
  return `${JSON.stringify(schema, null, 2)}\n`;
}
