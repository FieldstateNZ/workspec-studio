import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

/**
 * Connects the given MCP `Server` to stdio (stdin/stdout), resolving once
 * connected. The process itself stays alive afterwards: `StdioServerTransport`
 * keeps stdin's read stream active, which keeps Node's event loop non-empty
 * for as long as the client keeps the pipe open — there is nothing further
 * for this function to await.
 */
export async function runMcpStdio(server: Server): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
