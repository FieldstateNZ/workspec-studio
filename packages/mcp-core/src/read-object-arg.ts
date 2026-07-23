/**
 * Extracts a required field from an MCP tool call's `unknown` args, without
 * narrowing its shape further — the caller hands the raw value straight to
 * its own artifact schema's `safeParse`, which is the real validation.
 * Throws a plain `Error` when the key itself is missing (see
 * `read-string-arg.ts` for why a throw here is fine).
 */
export function readObjectArg(args: unknown, key: string): unknown {
  if (typeof args !== 'object' || args === null || !(key in args)) {
    throw new Error(`missing required argument "${key}"`);
  }
  return (args as Record<string, unknown>)[key];
}
