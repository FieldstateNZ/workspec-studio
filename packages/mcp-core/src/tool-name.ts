// The naming rule every MCP-visible identifier (a provider's namespace, and
// each tool's module-local name) must satisfy, plus the pure function that
// combines a namespace and a tool name into the wire name MCP clients see.
// Kept separate from `assemble-mcp-server.ts` so both the assembler and its
// tests can import the pattern without pulling in the SDK's `Server`.

/** Every namespace and tool name advertised over MCP must match this pattern. */
export const MCP_NAME_PATTERN = /^[a-zA-Z0-9_]+$/;

/**
 * Combines a provider's namespace and a tool's module-local name into the
 * wire name MCP clients see (`${namespace}_${name}`).
 */
export function buildWireName(namespace: string, name: string): string {
  return `${namespace}_${name}`;
}
