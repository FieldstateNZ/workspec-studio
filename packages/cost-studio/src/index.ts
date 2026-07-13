// @workspec/cost-studio — standalone CLI (`workspec-cost`) + (later)
// localhost host shell for WorkSpec Cost Attribution.
//
// C4: the filesystem repository + the real `workspec-cost` CLI (stocktake,
// validate, report, plan, apply) over `@workspec/cost-schema`'s
// `CostRepositoryPort`, `@workspec/cost-engine`'s attribution engine, and
// `@workspec/cost-provider`'s provider port (wired to
// `@workspec/cost-provider-azure` by default).
import { COST_UI_PACKAGE } from '@workspec/cost-ui';
import { COST_ENGINE_PACKAGE } from '@workspec/cost-engine';
import { COST_PROVIDER_PACKAGE } from '@workspec/cost-provider';
import { COST_SCHEMA_PACKAGE } from '@workspec/cost-schema';

export const COST_STUDIO_PACKAGE = '@workspec/cost-studio' as const;

/**
 * The full set of `@workspec/cost-*` package identities this studio build is
 * wired against — proves the whole module's dependency graph resolves, not
 * just one edge of it. Exported (rather than only asserted in a test) so the
 * wiring is exercised by real runtime code.
 */
export const COST_STUDIO_DEPENDENCIES = [
  COST_UI_PACKAGE,
  COST_ENGINE_PACKAGE,
  COST_PROVIDER_PACKAGE,
  COST_SCHEMA_PACKAGE,
] as const;

// ── Filesystem repository (implements the C4 CostRepositoryPort) ───────────
export { FsRepository, ArtifactValidationError } from './fs-repository.js';

// ── CLI entry (also the executable's `run`) ───────────────────────────────────
export { run } from './cli.js';
export type { CliIO, RunDeps } from './cli.js';

// ── Re-export the port + in-memory double for host/embedder convenience ───
export { createMemoryRepository } from '@workspec/cost-schema';
export type {
  AttributionRef,
  CostRepositoryPort,
  InventoryRef,
  Ref,
  SpendRef,
  TagPlanRef,
} from '@workspec/cost-schema';
