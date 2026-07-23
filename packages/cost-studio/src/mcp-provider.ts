// The `cost` MCP provider — the surface an MCP client/agent gets over a
// served directory of cost artifacts (`*.inventory.yaml`, `*.spend.yaml`,
// `*.attribution.yaml`, `*.tagplan.yaml`). Every tool delegates to the
// existing `FsRepository` and the shared domain cores (`collect-
// diagnostics.ts`, `report-core.ts`, `plan-core.ts`, `stocktake-core.ts`,
// `apply-core.ts`) — this module is wiring, not a second implementation of
// read/write/validate/report/plan/stocktake/apply logic. `FsRepository.resolve()`
// remains the sole authoritative containment check for every ref-shaped
// argument; tools pass refs through unchanged and map the resulting
// `RefEscapesRootError` (see `mcp-tools/map-repo-error-to-result.ts`).

import type { CloudProviderPort } from '@workspec/cost-provider';
import { createAzureProvider } from '@workspec/cost-provider-azure';
import type { McpToolProvider } from '@workspec/mcp-core';
import type { FsRepository } from './fs-repository.js';
import { buildApplyTool } from './mcp-tools/apply-tool.js';
import { buildListAttributionsTool } from './mcp-tools/list-attributions-tool.js';
import { buildListInventoriesTool } from './mcp-tools/list-inventories-tool.js';
import { buildListSpendsTool } from './mcp-tools/list-spends-tool.js';
import { buildListTagPlansTool } from './mcp-tools/list-tagplans-tool.js';
import { buildPlanTool } from './mcp-tools/plan-tool.js';
import { buildReadAttributionTool } from './mcp-tools/read-attribution-tool.js';
import { buildReadInventoryTool } from './mcp-tools/read-inventory-tool.js';
import { buildReadSpendTool } from './mcp-tools/read-spend-tool.js';
import { buildReadTagPlanTool } from './mcp-tools/read-tagplan-tool.js';
import { buildReportTool } from './mcp-tools/report-tool.js';
import { buildStocktakeTool } from './mcp-tools/stocktake-tool.js';
import { buildValidateTool } from './mcp-tools/validate-tool.js';
import { buildWriteAttributionTool } from './mcp-tools/write-attribution-tool.js';
import { buildWriteInventoryTool } from './mcp-tools/write-inventory-tool.js';
import { buildWriteSpendTool } from './mcp-tools/write-spend-tool.js';
import { buildWriteTagPlanTool } from './mcp-tools/write-tagplan-tool.js';

/** Injectable dependencies for the tools (`stocktake`/`apply`) that need a cloud provider or a clock. */
export interface CostMcpProviderDeps {
  /** Cloud provider for `stocktake`/`apply` (default: `createAzureProvider()`). */
  provider?: CloudProviderPort;
  /** Clock for `stocktake`'s default billing period (default: the real wall clock). */
  clock?: () => string;
}

/**
 * Builds the `cost` MCP provider over `repo`. Mount it with
 * `@workspec/mcp-core`'s `assembleMcpServer`:
 *
 * ```ts
 * const server = assembleMcpServer([createCostMcpProvider(repo)]);
 * ```
 *
 * Every tool is then advertised under `cost_<name>` (e.g. `cost_read_inventory`).
 * `deps.provider` defaults to `createAzureProvider()` — pass a fake in tests
 * so `stocktake`/`apply` never touch a real cloud provider.
 */
export function createCostMcpProvider(repo: FsRepository, deps: CostMcpProviderDeps = {}): McpToolProvider {
  const provider = deps.provider ?? createAzureProvider();
  const clock = deps.clock ?? (() => new Date().toISOString());

  return {
    namespace: 'cost',
    tools: [
      buildListInventoriesTool(repo),
      buildReadInventoryTool(repo),
      buildWriteInventoryTool(repo),
      buildListSpendsTool(repo),
      buildReadSpendTool(repo),
      buildWriteSpendTool(repo),
      buildListAttributionsTool(repo),
      buildReadAttributionTool(repo),
      buildWriteAttributionTool(repo),
      buildListTagPlansTool(repo),
      buildReadTagPlanTool(repo),
      buildWriteTagPlanTool(repo),
      buildValidateTool(repo),
      buildReportTool(repo),
      buildPlanTool(repo),
      buildStocktakeTool(repo, provider, clock),
      buildApplyTool(repo, provider),
    ],
  };
}
