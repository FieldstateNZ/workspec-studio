// The `decisions` MCP provider — the surface an MCP client/agent gets over a
// served directory of repository-native Decision artifacts. Every
// tool delegates to the existing `FsRepository` (and, for `validate` and
// `render_adr`, `@workspec/decision-engine`) — this module is wiring, not a
// second implementation of read/write/validate logic. `FsRepository.resolve()`
// remains the sole authoritative containment check for every ref-shaped
// argument; tools pass refs through unchanged and map the resulting
// `RefEscapesRootError` (see `mcp-tools/map-repo-error-to-result.ts`).

import type { McpToolProvider } from '@workspec/mcp-core';
import type { FsRepository } from './fs-repository.js';
import { buildListDecisionsTool } from './mcp-tools/list-decisions-tool.js';
import { buildReadDecisionTool } from './mcp-tools/read-decision-tool.js';
import { buildRenderAdrTool } from './mcp-tools/render-adr-tool.js';
import { buildValidateTool } from './mcp-tools/validate-tool.js';
import { buildWriteDecisionTool } from './mcp-tools/write-decision-tool.js';

/**
 * Builds the `decisions` MCP provider over `repo`. Mount it with
 * `@workspec/mcp-core`'s `assembleMcpServer`:
 *
 * ```ts
 * const server = assembleMcpServer([createDecisionMcpProvider(repo)]);
 * ```
 *
 * Every tool is then advertised under `decisions_<name>` (e.g.
 * `decisions_read`).
 */
export function createDecisionMcpProvider(repo: FsRepository): McpToolProvider {
  return {
    namespace: 'decisions',
    tools: [
      buildListDecisionsTool(repo),
      buildReadDecisionTool(repo),
      buildWriteDecisionTool(repo),
      buildValidateTool(repo),
      buildRenderAdrTool(repo),
    ],
  };
}
