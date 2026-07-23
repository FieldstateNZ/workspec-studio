/**
 * Reads an optional string field from an MCP tool call's `unknown` args:
 * `undefined` when the key is absent (or explicitly `undefined`), the string
 * when present and correctly typed. Throws a plain `Error` when the key is
 * present but not a string — callers route that through their own
 * `mapRepoErrorToResult`, same as `@workspec/mcp-core`'s `readStringArg` for
 * required fields.
 */
export function readOptionalStringArg(args: unknown, key: string): string | undefined {
  if (typeof args !== 'object' || args === null || !(key in args)) return undefined;
  const value = (args as Record<string, unknown>)[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    throw new Error(`argument "${key}" must be a string`);
  }
  return value;
}
