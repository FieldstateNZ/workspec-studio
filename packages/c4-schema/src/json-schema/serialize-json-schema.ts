/**
 * Serializes a JSON Schema object to the exact byte format committed under
 * `json-schema/c4/`: 2-space indent, a trailing newline, no trailing
 * whitespace. Both `scripts/gen-schema.ts` and the drift test must use
 * this so "regenerate in-memory" and "the committed file" are compared on
 * equal footing.
 */
export function serializeJsonSchema(schema: unknown): string {
  return `${JSON.stringify(schema, null, 2)}\n`;
}
