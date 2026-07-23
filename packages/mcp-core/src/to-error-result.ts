import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * Converts a thrown value into an `isError` `CallToolResult`. Only
 * `Error#message` is ever used — never `Error#stack` — so a tool handler's
 * unexpected throw can never leak internals (stack frames, absolute
 * filesystem paths from a source map) to an MCP client over the wire.
 */
export function toErrorResult(error: unknown): CallToolResult {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: 'text', text: message }], isError: true };
}
