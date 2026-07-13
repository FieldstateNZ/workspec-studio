// @workspec/cost-engine — the pure, normative attribution engine for WorkSpec
// Cost Attribution.
//
// It turns an Inventory + Spend rows + an Attribution ruleset into per-
// resource dimension assignments (with a full cascade trace for the C5
// workbench), rule stats, coverage, rollups, cross-tabs, and a tag-plan
// diff. The contract is NORMATIVE: identical input must yield identical
// output across any conforming implementation. See the package README for
// the full semantics (matching, per-dimension precedence, coverage, splits,
// diagnostics) and the golden fixture (`test/fixtures/demo-estate/`) for the
// cross-implementation conformance artifact. No IO, no DOM, no React, and
// the only runtime dependency is `@workspec/cost-schema`.

import { SCHEMA_VERSION } from '@workspec/cost-schema';

/** This package's own identity (mirrors `@workspec/cost-schema`'s convention). */
export const COST_ENGINE_PACKAGE = '@workspec/cost-engine' as const;

/** The artifact schema version this engine build conforms to. */
export const ENGINE_TARGET_SCHEMA = SCHEMA_VERSION;

// ── Matching ─────────────────────────────────────────────────────────────
export { matchRule, globToRegExp } from './match.js';

// ── Resolution (per-dimension first-set-wins, then overrides) ────────────
export { resolveAttribution } from './resolve.js';

// ── Spend joining ────────────────────────────────────────────────────────
export { joinSpend } from './spend-join.js';
export type { SpendJoin } from './spend-join.js';

// ── Rollups, cross-tabs, coverage ────────────────────────────────────────
export { computeCoverage, crossTab, rollupBy } from './rollup.js';

// ── Full attribution result (resolution + spend + rollups + coverage) ────
export { attribute } from './attribute.js';

// ── Tag plan diff ────────────────────────────────────────────────────────
export { buildTagPlan, plan, serializeSplitValue } from './plan.js';

// ── Result types ─────────────────────────────────────────────────────────
export type {
  AttributeResult,
  Coverage,
  CrossTab,
  CrossTabCell,
  Diagnostic,
  DiagnosticCode,
  DiagnosticSeverity,
  DimensionAssignment,
  OrphanSpendRow,
  Orphans,
  OverrideTraceEntry,
  ResolveAttributionResult,
  ResourceResolution,
  Rollup,
  RollupBucket,
  RuleStat,
  RuleTraceEntry,
  ShadowedDimension,
  SplitAssignment,
  SplitPart,
  TagMapping,
  Totals,
  ValueAssignment,
} from './types.js';
