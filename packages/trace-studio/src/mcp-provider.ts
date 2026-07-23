// The `trace` MCP provider — the surface an MCP client/agent gets over a
// served `.workspec/` tree. Mirrors the CLI's own four subcommands
// (`emit`/`ingest`/`verify`/`matrix`) EXACTLY — no list/read/write-per-kind
// tools, since trace-studio's own CLI doesn't expose raw artifact CRUD
// either, only these four higher-level operations. Every tool delegates to
// the shared domain cores (`emit-core.ts`/`ingest-core.ts`/
// `verify-core.ts`/`matrix-core.ts`) — this module is wiring, not a second
// implementation of emit/ingest/verify/matrix logic.

import type { McpToolProvider } from '@workspec/mcp-core';
import { buildEmitTool } from './mcp-tools/emit-tool.js';
import { buildIngestTool } from './mcp-tools/ingest-tool.js';
import { buildMatrixTool } from './mcp-tools/matrix-tool.js';
import { buildVerifyTool } from './mcp-tools/verify-tool.js';
import type { TraceRepositoryPort } from './repository.js';

/**
 * Builds the `trace` MCP provider over `repo`. Mount it with
 * `@workspec/mcp-core`'s `assembleMcpServer`:
 *
 * ```ts
 * const server = assembleMcpServer([createTraceMcpProvider(repo)]);
 * ```
 *
 * Every tool is then advertised under `trace_<name>` (e.g. `trace_verify`).
 */
export function createTraceMcpProvider(repo: TraceRepositoryPort): McpToolProvider {
  return {
    namespace: 'trace',
    tools: [
      buildEmitTool(repo),
      buildIngestTool(repo),
      buildVerifyTool(repo),
      buildMatrixTool(repo),
    ],
  };
}
