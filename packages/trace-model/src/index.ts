// @workspec/trace-model — the pure, normative traceability engine for the
// WorkSpec Traceability Workbench.
//
// It derives (never stores, per spec §4.7) the traceability graph from a
// tree of located artifacts: the per-scenario evidence join (keyed on the
// scenario slug — the scenario IS the executed unit), each Rule's
// `ruleProven`/`empty` predicates, the three meters (scenario coverage,
// userReq coverage, pass-rate — never collapsed, spec §5), and structured
// findings (data, never thrown). The contract is NORMATIVE: identical input
// yields byte-identical output across any conforming implementation. No IO,
// no DOM, no React; the only runtime dependency is `@workspec/req-schema`.
// See docs/traceability/spec.md §4.

import { REQ_SCHEMA_PACKAGE } from '@workspec/req-schema';

/** This package's own identity (mirrors `@workspec/cost-engine`'s convention). */
export const TRACE_MODEL_PACKAGE = '@workspec/trace-model' as const;

/** The req-schema package this engine consumes its input artifact types from. */
export const ENGINE_TARGET_SCHEMA = REQ_SCHEMA_PACKAGE;

// ── The derivation engine ─────────────────────────────────────────────────────
export { buildModel } from './build-model.js';

// ── Lookups over a derived model ──────────────────────────────────────────────
export { provenByOf, scenariosOf, sysreqsOf, userReqsOf, verifiersOf } from './lookups.js';

// ── Input + result types ──────────────────────────────────────────────────────
export type {
  Evidence,
  EvidenceStatus,
  FeatureNode,
  Finding,
  FindingKind,
  FindingSeverity,
  Located,
  Meter,
  RunRef,
  ScenarioNode,
  ScenarioProof,
  SourceLocation,
  SysReqNode,
  TestRun,
  TraceModel,
  TraceTree,
  UserReqNode,
} from './types.js';
