/**
 * Reads an optional boolean field from an MCP tool call's `unknown` args:
 * `false` when the key is absent (or explicitly `undefined`), the boolean
 * when present and correctly typed. Throws a plain `Error` otherwise —
 * callers route that through their own `mapRepoErrorToResult`, same as
 * `@workspec/mcp-core`'s `readStringArg` for required fields.
 */
export function readOptionalBooleanArg(args: unknown, key: string): boolean {
  if (typeof args !== 'object' || args === null || !(key in args)) return false;
  const value = (args as Record<string, unknown>)[key];
  if (value === undefined) return false;
  if (typeof value !== 'boolean') {
    throw new Error(`argument "${key}" must be a boolean`);
  }
  return value;
}
