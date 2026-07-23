/**
 * Extracts a required string field from an MCP tool call's `unknown` args.
 * Throws a plain `Error` on anything else (missing key, non-object args,
 * wrong type) — `assembleMcpServer` catches any handler throw and converts
 * it to an `isError` `CallToolResult`, so this is a legitimate
 * "self-validation" path for a tool handler, not an escape from the
 * no-throw convention.
 */
export function readStringArg(args: unknown, key: string): string {
  if (typeof args !== 'object' || args === null || !(key in args)) {
    throw new Error(`missing required argument "${key}"`);
  }
  const value = (args as Record<string, unknown>)[key];
  if (typeof value !== 'string') {
    throw new Error(`argument "${key}" must be a string`);
  }
  return value;
}
