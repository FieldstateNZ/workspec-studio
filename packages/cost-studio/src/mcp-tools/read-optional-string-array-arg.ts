/**
 * Reads an optional string-array field from an MCP tool call's `unknown`
 * args: `[]` when the key is absent (or explicitly `undefined`), the array
 * when present and every element is a string. Throws a plain `Error`
 * otherwise — callers route that through their own `mapRepoErrorToResult`,
 * same as `@workspec/mcp-core`'s `readStringArg` for required fields.
 */
export function readOptionalStringArrayArg(args: unknown, key: string): string[] {
  if (typeof args !== 'object' || args === null || !(key in args)) return [];
  const value = (args as Record<string, unknown>)[key];
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new Error(`argument "${key}" must be an array of strings`);
  }
  return value as string[];
}
