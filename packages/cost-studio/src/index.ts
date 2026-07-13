// @workspec/cost-studio — standalone CLI + (later) localhost host shell for
// WorkSpec Cost Attribution.
//
// C0 bootstrap: depends on cost-ui + cost-engine + cost-provider + cost-schema
// (the whole module), and exports only its own identity plus the CLI entry
// point. Real commands (validate, serve, ...) land in a later slice.
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

// ── CLI entry (also the executable's `run`) ───────────────────────────────────
export { run } from './cli.js';
export type { CliIO } from './cli.js';
