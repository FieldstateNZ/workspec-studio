// Assembles a low-level MCP `Server` (not the high-level `McpServer`) from
// namespaced tool providers. The low-level `Server` is what lets tools
// advertise raw JSON Schema via `setRequestHandler` instead of `registerTool`,
// which couples every tool's schema to the SDK's bundled zod version — the
// whole reason this package exists is to stay off that coupling.

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type ListToolsResult,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { buildToolRegistry } from './build-tool-registry.js';
import type { McpToolProvider } from './mcp-tool.types.js';
import { toErrorResult } from './to-error-result.js';

/** Server identity advertised during MCP's `initialize` handshake, when a caller doesn't supply one. */
const DEFAULT_SERVER_INFO = { name: 'workspec-mcp', version: '0.1.0-alpha.5' };

/**
 * Assembles a low-level MCP `Server` from one or more namespaced tool
 * providers. Every tool is registered under `${namespace}_${name}`; invalid
 * names and wire-name collisions throw immediately (see
 * {@link buildToolRegistry}), never surfacing later as a confusing
 * `tools/call` failure.
 *
 * `ListTools` returns every registered tool with its (already JSON Schema)
 * `inputSchema`. `CallTool` dispatches by wire name to the matching
 * `handler`; an unknown wire name or a handler that throws both become an
 * `isError` result rather than a transport-level crash.
 */
export function assembleMcpServer(
  providers: McpToolProvider[],
  info: { name: string; version: string } = DEFAULT_SERVER_INFO,
): Server {
  const registry = buildToolRegistry(providers);
  const server = new Server(info, { capabilities: { tools: {} } });

  server.setRequestHandler(
    ListToolsRequestSchema,
    async (): Promise<ListToolsResult> => ({
      tools: Array.from(registry.entries()).map(([wireName, tool]): Tool => {
        const wireTool: Tool = {
          name: wireName,
          description: tool.description,
          // `Tool.inputSchema` is the SDK's own locally-checked shape (a
          // `type: "object"` literal, etc.); ours is deliberately the looser
          // `Record<string, unknown>` so any JSON Schema producer works
          // without this package depending on the SDK's bundled zod version.
          // The cast bridges the two — every JSON Schema a tool provides in
          // practice already has `type: "object"` at the top level.
          inputSchema: tool.inputSchema as unknown as Tool['inputSchema'],
        };
        return tool.title !== undefined ? { ...wireTool, title: tool.title } : wireTool;
      }),
    }),
  );

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = registry.get(request.params.name);
    if (tool === undefined) {
      return toErrorResult(new Error(`unknown tool "${request.params.name}"`));
    }
    try {
      return await tool.handler(request.params.arguments ?? {});
    } catch (error) {
      return toErrorResult(error);
    }
  });

  return server;
}
