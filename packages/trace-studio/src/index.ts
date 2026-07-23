// @workspec/trace-studio — the `workspec-trace` CLI (emit / ingest / verify)
// for the WorkSpec Traceability Workbench. This is the T4 milestone: shippable
// value with zero frontend (spec §6/§8). The host shell (`/traceability`) lands
// in T8. Mirrors @workspec/cost-studio's shape: a thin, testable `run(argv, io,
// deps)` core over an injectable filesystem repository port, with `bin.ts` as
// the only file that touches `process`.

import { REQ_SCHEMA_PACKAGE } from '@workspec/req-schema';
import { SCHEMA_CORE_PACKAGE } from '@workspec/schema-core';
import { TRACE_MODEL_PACKAGE } from '@workspec/trace-model';
import { TRACE_EMITTERS_PACKAGE } from '@workspec/trace-emitters';

export const TRACE_STUDIO_PACKAGE = '@workspec/trace-studio' as const;

/**
 * The full set of `@workspec/*` package identities this studio build is wired
 * against — proves the whole module's dependency graph resolves, not just one
 * edge of it. Exported (rather than only asserted in a test) so the wiring is
 * exercised by real runtime code (mirrors `@workspec/cost-studio`).
 */
export const TRACE_STUDIO_DEPENDENCIES = [
  SCHEMA_CORE_PACKAGE,
  REQ_SCHEMA_PACKAGE,
  TRACE_MODEL_PACKAGE,
  TRACE_EMITTERS_PACKAGE,
] as const;

// ── Filesystem repository (implements the TraceRepositoryPort) ─────────────────
export { FsRepository, DEFAULT_RUNS_DIR, RefEscapesRootError } from './fs-repository.js';

// ── The repository port + its in-memory double (for hosts/embedders/tests) ─────
export { createMemoryRepository } from './repository.js';
export type {
  LoadIssue,
  LoadedRuns,
  LoadedTree,
  MemoryRepository,
  MemoryRepositoryInit,
  TraceRepositoryPort,
} from './repository.js';

// ── CLI entry (also the executable's `run`) ────────────────────────────────────
export { run } from './cli.js';
export type { CliIO, RunDeps } from './cli.js';

// ── The `trace` MCP provider (Step 4) — mount with @workspec/mcp-core's
//    `assembleMcpServer`; the `mcp` CLI subcommand does exactly this. ─────────
export { createTraceMcpProvider } from './mcp-provider.js';

// ── The RTM (matrix) pure serializer layer — no IO, so an embedder (a future
//    Matrix-view export button, spec §5) can reuse the same projection +
//    renderers the CLI's `matrix` command wires up. ───────────────────────────
export { buildMatrixRows, EMPTY_RULE_SCENARIO_LABEL } from './matrix-rows.js';
export { MATRIX_COLUMNS } from './matrix-columns.js';
export type { MatrixColumn } from './matrix-columns.js';
export type { MatrixRow } from './matrix-row.types.js';
export { resolveMatrixFormat } from './matrix-format.js';
export type { MatrixFormat } from './matrix-format.js';
export { renderMatrix } from './matrix-render.js';
export { renderMatrixCsv } from './matrix-csv.js';
export { renderMatrixHtml } from './matrix-html.js';
export { renderMatrixMarkdown } from './matrix-markdown.js';
