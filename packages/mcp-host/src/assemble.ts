// Builds every `*-studio` MCP provider over one shared directory. This is
// the whole reason `@workspec/mcp-host` exists: Steps 1-4 built four
// independent MCP providers (`decisions`, `cost`, `c4`, `trace`), each with
// its own repository/source construction over a directory; the topology
// family (P1-P9) added a fifth, `topology`, the same shape. This module does
// the SAME five constructions, once each, over ONE resolved `dir`, so a
// single agent/client sees all five namespaces behind one server.

import { resolve } from 'node:path';
import type { McpToolProvider } from '@workspec/mcp-core';
import { createC4McpProvider, createFsSource } from '@workspec/c4-studio';
import { createCostMcpProvider, FsRepository as CostFsRepository } from '@workspec/cost-studio';
import { createDecisionMcpProvider, FsRepository as DecisionFsRepository } from '@workspec/decision-studio';
import { createTopologyMcpProvider, FsRepository as TopologyFsRepository } from '@workspec/topology-studio';
import { createTraceMcpProvider, FsRepository as TraceFsRepository } from '@workspec/trace-studio';

/**
 * Constructs all five `*-studio` MCP providers over `dir` (resolved to an
 * absolute path first, so every provider's repository/source agrees on the
 * same root regardless of the caller's own cwd). Order is stable —
 * decisions, cost, c4, trace, topology — matching the order each provider
 * shipped in (Steps 1-4, then the topology family).
 *
 * Each provider owns its own read/write/validate tools under its namespace
 * (`decisions_*`, `cost_*`, `c4_*`, `trace_*`, `topology_*`); this function
 * does no tool wiring of its own, only the five constructions
 * `assembleMcpServer` needs.
 */
export function buildAllProviders(dir: string): McpToolProvider[] {
  const root = resolve(dir);

  return [
    createDecisionMcpProvider(new DecisionFsRepository(root)),
    createCostMcpProvider(new CostFsRepository(root)),
    createC4McpProvider(createFsSource(root)),
    createTraceMcpProvider(new TraceFsRepository(root)),
    createTopologyMcpProvider(new TopologyFsRepository(root)),
  ];
}
