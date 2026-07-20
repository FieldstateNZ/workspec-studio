import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * One MCP tool a domain package exposes. `name` is module-local — unique
 * within the owning provider's `namespace`, not globally — since
 * `assembleMcpServer` combines the two into the wire name MCP clients see
 * (`${namespace}_${name}`).
 *
 * Deliberately zod-agnostic: `inputSchema` is a raw JSON Schema object (any
 * schema library, or none, can produce one) and `handler` receives `unknown`
 * and is responsible for validating its own arguments before acting on them.
 * This is what lets `@workspec/mcp-core` stay free of a `zod` dependency (and
 * therefore free of the version-coupling that comes with one) while every
 * domain package validates with whatever schema library it already uses.
 */
export interface McpToolDef {
  /** Module-local tool name. Must match `/^[a-zA-Z0-9_]+$/`. */
  name: string;
  /** Optional human-readable title surfaced to MCP clients/agents. */
  title?: string;
  /** One-paragraph description of what the tool does — surfaced via `tools/list`. */
  description: string;
  /** JSON Schema object describing the tool's arguments, advertised via `tools/list`. */
  inputSchema: Record<string, unknown>;
  /**
   * Handles a `tools/call` invocation. Must validate `args` itself and should
   * prefer returning `{ isError: true, ... }` over throwing for expected
   * validation failures. An unexpected throw is still caught and converted to
   * an error result by `assembleMcpServer` — it never crashes the server —
   * but the resulting message is whatever `Error#message` says, so a handler
   * that wants a clean client-facing message should throw one.
   */
  handler: (args: unknown) => Promise<CallToolResult>;
}

/** A domain package's MCP surface: a namespace plus the tools it exposes under it. */
export interface McpToolProvider {
  /**
   * Prefixed onto every tool's wire name (`${namespace}_${tool.name}`).
   * Must match `/^[a-zA-Z0-9_]+$/`.
   */
  namespace: string;
  /** The tools this provider exposes. */
  tools: McpToolDef[];
}
