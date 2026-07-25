// @workspec/topology-studio — standalone CLI (`workspec-topology`) +
// localhost host shell for WorkSpec Topology Studio.
//
// The runtime host for the topology family: the filesystem repository, the
// real `workspec-topology` CLI (validate, import, reconcile, cost, render,
// serve, mcp) over `@workspec/topology-schema`'s `TopologyRepositoryPort`,
// `@workspec/topology-model`'s loader/resolver, `@workspec/topology-recon`'s
// reconciliation, `@workspec/topology-cost`'s pricing, and
// `@workspec/topology-adapters`' import adapters.

import { TOPOLOGY_ADAPTERS_PACKAGE } from '@workspec/topology-adapters';
import { TOPOLOGY_SCHEMA_PACKAGE } from '@workspec/topology-schema';

export const TOPOLOGY_STUDIO_PACKAGE = '@workspec/topology-studio' as const;

/**
 * The full set of `@workspec/topology-*` package identities this studio
 * build is wired against — proves the whole module's dependency graph
 * resolves, not just one edge of it. Exported (rather than only asserted in
 * a test) so the wiring is exercised by real runtime code.
 */
export const TOPOLOGY_STUDIO_DEPENDENCIES = [TOPOLOGY_SCHEMA_PACKAGE, TOPOLOGY_ADAPTERS_PACKAGE] as const;

// ── Filesystem repository (implements the C4 TopologyRepositoryPort) ───────
export { FsRepository, ArtifactValidationError, RefEscapesRootError } from './fs-repository.js';

// ── Read-only whole-tree model + resolve() bridge ───────────────────────────
export { loadAuthoredModel } from './load-authored-model.js';
export { resolveModelForEnv } from './resolve-model.js';

// ── The "actual" (derived/imported) side of reconciliation ─────────────────
export {
  derivedDirFor,
  loadDerivedTopology,
  writeDerivedResources,
  TOPOLOGY_ACTUAL_DIR,
  InvalidEnvSlugError,
} from './derived-topology.js';
export type { LoadDerivedTopologyOutcome } from './derived-topology.js';

// ── Catalog lookup (for `cost`) ─────────────────────────────────────────────
export { catalogRefFor, loadCatalog } from './load-catalog.js';
export type { LoadCatalogOutcome } from './load-catalog.js';

// ── Lens rendering (for the CLI `render` command) ───────────────────────────
export { buildLens, renderLensText } from './render-lens.js';

// ── Host shell: the Express app + the serve command ─────────────────────────
export { createServer } from './server.js';
export type { CreateServerOptions } from './server.js';
export { runServe } from './serve.js';

// ── MCP provider (mount via @workspec/mcp-core's assembleMcpServer) ────────
export { createTopologyMcpProvider } from './mcp-provider.js';

// ── CLI entry (also the executable's `run`) ─────────────────────────────────
export { run } from './cli.js';
export type { CliIO, RunDeps } from './cli.js';

// ── Re-export the port + in-memory double for host/embedder convenience ────
export { createMemoryRepository } from '@workspec/topology-schema';
export type {
  EnvironmentRef,
  Ref,
  ResourceRef,
  TopologyRef,
  TopologyRepositoryPort,
} from '@workspec/topology-schema';
