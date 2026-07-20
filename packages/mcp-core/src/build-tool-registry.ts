import type { McpToolDef, McpToolProvider } from './mcp-tool.types.js';
import { MCP_NAME_PATTERN, buildWireName } from './tool-name.js';

/**
 * Validates every provider's namespace and tool names against
 * {@link MCP_NAME_PATTERN}, and builds the combined wire-name → tool
 * registry `assembleMcpServer` dispatches `tools/call` against.
 *
 * Throws on the first invalid name or duplicate wire name. This is
 * deliberately assembly-time validation, not call-time: a naming collision
 * between two providers is a programming error in how the server was wired,
 * not a runtime condition any caller should have to handle per-request.
 */
export function buildToolRegistry(providers: McpToolProvider[]): Map<string, McpToolDef> {
  const registry = new Map<string, McpToolDef>();
  for (const provider of providers) {
    if (!MCP_NAME_PATTERN.test(provider.namespace)) {
      throw new Error(
        `invalid MCP namespace "${provider.namespace}" (must match ${MCP_NAME_PATTERN})`,
      );
    }
    for (const tool of provider.tools) {
      if (!MCP_NAME_PATTERN.test(tool.name)) {
        throw new Error(
          `invalid MCP tool name "${tool.name}" in namespace "${provider.namespace}" ` +
            `(must match ${MCP_NAME_PATTERN})`,
        );
      }
      const wireName = buildWireName(provider.namespace, tool.name);
      if (registry.has(wireName)) {
        throw new Error(`duplicate MCP tool wire name "${wireName}"`);
      }
      registry.set(wireName, tool);
    }
  }
  return registry;
}
