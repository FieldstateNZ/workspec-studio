/**
 * `@workspec/topology-recon` — the pure, normative reconciliation layer of
 * the topology family (spec §4): drift between an authored `ResolvedTopology`
 * (one environment, already run through `@workspec/topology-model`'s
 * `resolve()`) and a `DerivedTopology` describing that same environment's
 * actual deployed state. No IO/DOM/React; deterministic — identical input
 * always yields an identical `Drift[]`.
 */

// ── reconcile() — THE NORMATIVE CONTRACT (spec §4) ──────────────────────────
export { reconcile } from './reconcile/reconcile.js';
export { summarizeDrift } from './reconcile/summarize-drift.js';
export { sortDrifts } from './reconcile/sort-drifts.js';

// ── The matcher (spec §4: source.from, then the (kind,type,resourceGroup,name) tuple) ──
export { matchResources } from './match/match-resources.js';
export type { MatchResult, MatchRung, ResourceMatch } from './match/match-resources.types.js';

// ── `actual` input shape ─────────────────────────────────────────────────────
export type {
  DerivedConnection,
  DerivedResource,
  DerivedTopology,
} from './model/derived-topology.types.js';

// ── Drift output shape ───────────────────────────────────────────────────────
export { DRIFT_CLASSES } from './model/drift.types.js';
export type {
  ConfigKeyDiff,
  CostKeyDiff,
  Drift,
  DriftClass,
  DivergentDrift,
  MiswiredDrift,
  MiswiredEdge,
  OrphanDrift,
  PhantomDrift,
} from './model/drift.types.js';
export type { DriftCountsByClass, DriftSummary } from './model/drift-summary.types.js';
