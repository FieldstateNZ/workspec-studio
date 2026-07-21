/**
 * Reads an optional number field from an MCP tool call's `unknown` args:
 * `undefined` when the key is absent (or explicitly `undefined`), the number
 * when present and correctly typed. Throws a plain `Error` when the key is
 * present but not a number — callers route that through their own
 * `mapTraceErrorToResult`, same as `@workspec/mcp-core`'s `readStringArg` for
 * required fields. Used by `verify`'s `min*Coverage`/`minPassRate` args,
 * which arrive as JSON numbers (no string-to-number parsing needed, unlike
 * the CLI's `--min-*` flags).
 */
export function readOptionalNumberArg(args: unknown, key: string): number | undefined {
  if (typeof args !== 'object' || args === null || !(key in args)) return undefined;
  const value = (args as Record<string, unknown>)[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'number') {
    throw new Error(`argument "${key}" must be a number`);
  }
  return value;
}
