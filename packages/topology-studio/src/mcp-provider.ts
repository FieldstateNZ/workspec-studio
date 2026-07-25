// The `topology` MCP provider — the surface an MCP client/agent gets over a
// served directory of topology artifacts (`.workspec/topologies/*.yaml`,
// `.workspec/resources/*.yaml`, `.workspec/environments/*.yaml`). Every tool
// delegates to the existing `FsRepository`, `@workspec/topology-model`'s
// `loadTopologyModel`/`resolve()`, `@workspec/topology-recon`'s `reconcile()`,
// `@workspec/topology-cost`'s `computeTopologyCost()`, and
// `@workspec/topology-adapters`' adapters — this module is wiring, not a
// second implementation of any of that. `FsRepository.resolve()` remains the
// sole authoritative containment check for every ref-shaped argument; tools
// pass refs through unchanged and map the resulting `RefEscapesRootError`
// (see `mcp-tools/map-repo-error-to-result.ts`).

import type { McpToolProvider } from '@workspec/mcp-core';
import type { FsRepository } from './fs-repository.js';
import { buildCostTool } from './mcp-tools/cost-tool.js';
import { buildImportTool } from './mcp-tools/import-tool.js';
import { buildListEnvironmentsTool } from './mcp-tools/list-environments-tool.js';
import { buildListResourcesTool } from './mcp-tools/list-resources-tool.js';
import { buildListTopologiesTool } from './mcp-tools/list-topologies-tool.js';
import { buildReadEnvironmentTool } from './mcp-tools/read-environment-tool.js';
import { buildReadResourceTool } from './mcp-tools/read-resource-tool.js';
import { buildReadTopologyTool } from './mcp-tools/read-topology-tool.js';
import { buildReconcileTool } from './mcp-tools/reconcile-tool.js';
import { buildResolveTool } from './mcp-tools/resolve-tool.js';
import { buildValidateTool } from './mcp-tools/validate-tool.js';
import { buildWriteEnvironmentTool } from './mcp-tools/write-environment-tool.js';
import { buildWriteResourceTool } from './mcp-tools/write-resource-tool.js';
import { buildWriteTopologyTool } from './mcp-tools/write-topology-tool.js';

/**
 * Builds the `topology` MCP provider over `repo`. Mount it with
 * `@workspec/mcp-core`'s `assembleMcpServer`:
 *
 * ```ts
 * const server = assembleMcpServer([createTopologyMcpProvider(repo)]);
 * ```
 *
 * Every tool is then advertised under `topology_<name>` (e.g.
 * `topology_read_resource`).
 */
export function createTopologyMcpProvider(repo: FsRepository): McpToolProvider {
  return {
    namespace: 'topology',
    tools: [
      buildListTopologiesTool(repo),
      buildReadTopologyTool(repo),
      buildWriteTopologyTool(repo),
      buildListResourcesTool(repo),
      buildReadResourceTool(repo),
      buildWriteResourceTool(repo),
      buildListEnvironmentsTool(repo),
      buildReadEnvironmentTool(repo),
      buildWriteEnvironmentTool(repo),
      buildValidateTool(repo),
      buildResolveTool(repo),
      buildReconcileTool(repo),
      buildCostTool(repo),
      buildImportTool(),
    ],
  };
}
