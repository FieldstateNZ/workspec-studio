// @workspec/decision-engine — the pure, normative cost engine for WorkSpec
// Decision Studio.
//
// It takes an S1 `Decision` plus its externalised `Catalog` (porting decision
// P2) and produces per-line / per-env / per-option costs, a decision-level
// roll-up, an optimisation-headroom hint (P5), and a weighted recommendation
// (P4). The contract is NORMATIVE: identical input must yield identical output
// across any conforming implementation. See the package README and the golden
// snapshot for the conformance artifact. No IO, no DOM, no React, and the only
// runtime dependency is `@workspec/decision-schema`.

import { SCHEMA_VERSION } from '@workspec/decision-schema';

/** The artifact schema version this engine build conforms to. */
export const ENGINE_TARGET_SCHEMA = SCHEMA_VERSION;

// ── Cost engine (per-line, per-option, decision-level) ───────────────────────
export { lineEnvCost, applyLevers, computeOption, compute } from './cost.js';

// ── Weighted recommendation (P4) ─────────────────────────────────────────────
export { recommend, cheapest, COST_COEFFICIENT } from './recommend.js';

// ── Catalog reference validation ─────────────────────────────────────────────
export { validateRefs } from './validate.js';

// ── Shared deterministic ADR renderer (one renderer, two consumers) ──────────
export { buildAdrModel, renderAdrMarkdown, formatMoney } from './adr.js';
export type {
  AdrModel,
  AdrStatus,
  AdrConsideredOption,
  AdrDecision,
  AdrConsequence,
  AdrLink,
} from './adr.js';

// ── Result types ─────────────────────────────────────────────────────────────
export type { LineRow, OptionCost, DecisionCostResult, RefField, RefError } from './types.js';
