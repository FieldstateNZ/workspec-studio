// @workspec/trace-studio — the `workspec-trace` CLI + (later) localhost host
// shell for the WorkSpec Traceability Workbench.
//
// T0 bootstrap skeleton (see docs/traceability/spec.md §7/§8): `run` is a
// no-op that prints usage. Real verbs (`emit`/`ingest`/`verify`) land in T4;
// the host shell (`/traceability`) lands in T8. Mirrors
// @workspec/cost-studio's shape.

export const TRACE_STUDIO_PACKAGE = '@workspec/trace-studio' as const;

// ── CLI entry (also the executable's `run`) ─────────────────────────────────
export { run } from './cli.js';
export type { CliIO } from './cli.js';
