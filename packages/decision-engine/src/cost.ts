// The normative cost engine. Pure functions over the S1 inferred types; the
// externalised catalog is passed in (porting decision P2 — no module globals).
//
// The math mirrors the prototype engine exactly (see the package README for the
// normative contract). Float order-of-operations is `price * mult * qty * pct`.

import type {
  Catalog,
  Decision,
  LineType as Line,
  OptionType as Option,
  PatchMatchType as PatchMatch,
  PatchOpType as PatchOp,
  PatchSetType as PatchSet,
  PricingModeType as PricingMode,
  ScheduleType as Schedule,
  SkuType as Sku,
} from '@workspec/decision-schema';
import type { DecisionCostResult, LineRow, OptionCost } from './types.js';

// ── Catalog defaults (mirror the prototype's PAYG / always-on fallbacks) ─────

/** Fallback when a SKU line names a mode absent from the catalog: PAYG list. */
const DEFAULT_MODE: { mult: number; committed: boolean } = {
  mult: 1,
  committed: false,
};

/** Fallback when a SKU line names a schedule absent from the catalog: 24×7. */
const DEFAULT_SCHEDULE: { pct: number } = { pct: 1 };

/** The env id treated as production for the headroom rule (P5). */
const PROD_ENV = 'prod';

/** A schedule at or above this share of the month counts as "steady / always-on". */
const STEADY_PCT = 0.95;

// ── Catalog index (memoised per catalog object) ──────────────────────────────

interface CatalogIndex {
  skus: Map<string, Sku>;
  modes: Map<string, PricingMode>;
  schedules: Map<string, Schedule>;
  /** Lowest `mult` among committed pricing modes, or undefined if there are none. */
  bestCommittedMult: number | undefined;
}

const indexCache = new WeakMap<Catalog, CatalogIndex>();

function buildIndex(catalog: Catalog): CatalogIndex {
  const skus = new Map<string, Sku>();
  for (const sku of catalog.spec.skus) skus.set(sku.id, sku);
  const modes = new Map<string, PricingMode>();
  for (const mode of catalog.spec.pricingModes) modes.set(mode.id, mode);
  const schedules = new Map<string, Schedule>();
  for (const schedule of catalog.spec.schedules) schedules.set(schedule.id, schedule);

  let bestCommittedMult: number | undefined;
  for (const mode of catalog.spec.pricingModes) {
    if (mode.committed && (bestCommittedMult === undefined || mode.mult < bestCommittedMult)) {
      bestCommittedMult = mode.mult;
    }
  }

  return { skus, modes, schedules, bestCommittedMult };
}

function catalogIndex(catalog: Catalog): CatalogIndex {
  let index = indexCache.get(catalog);
  if (index === undefined) {
    index = buildIndex(catalog);
    indexCache.set(catalog, index);
  }
  return index;
}

// ── Per-line, per-env monthly cost ───────────────────────────────────────────

/**
 * Monthly cost of one line in one environment.
 *
 * - Flat line → `amount[env] ?? 0`.
 * - SKU line → `qty[env] ?? 0` units; 0 units ⇒ 0. Unknown SKU ⇒ 0. Unknown
 *   mode defaults to PAYG (mult 1, non-committed); unknown schedule defaults to
 *   24×7 (pct 1). Committed modes ignore the schedule (`effPct = 1`); otherwise
 *   `effPct = schedule.pct`. Returns `price * mult * qty * effPct`.
 */
export function lineEnvCost(line: Line, env: string, catalog: Catalog): number {
  if (line.flat) {
    return line.amount[env] ?? 0;
  }
  const qty = line.qty[env] ?? 0;
  if (qty === 0) return 0;

  const index = catalogIndex(catalog);
  const sku = index.skus.get(line.sku);
  if (sku === undefined) return 0;

  const mode = index.modes.get(line.mode) ?? DEFAULT_MODE;
  const schedule = index.schedules.get(line.schedule) ?? DEFAULT_SCHEDULE;
  const effPct = mode.committed ? 1 : schedule.pct;
  return sku.price * mode.mult * qty * effPct;
}

// ── Lever interpreter (declarative patch grammar, P1) ────────────────────────

function cloneLine(line: Line): Line {
  return line.flat ? { ...line, amount: { ...line.amount } } : { ...line, qty: { ...line.qty } };
}

/**
 * Does a line match a patch `match`? Facets are OR'd: a line matches if its
 * `tag` is in `match.tags`, OR its `group` is in `match.groups`, OR its `id` is
 * in `match.ids`. An empty match (no tags/groups/ids) matches every line.
 * `match.envs` is not a line-selection facet — it scopes `qtyScale` only.
 */
function matchesLine(match: PatchMatch, line: Line): boolean {
  const { tags, groups, ids } = match;
  if (tags === undefined && groups === undefined && ids === undefined) {
    return true;
  }
  if (tags !== undefined && line.tag !== undefined && tags.includes(line.tag)) {
    return true;
  }
  if (groups !== undefined && line.group !== undefined && groups.includes(line.group)) {
    return true;
  }
  if (ids !== undefined && ids.includes(line.id)) {
    return true;
  }
  return false;
}

function applySet(set: PatchSet, line: Line, envs: readonly string[]): void {
  // Field mutations apply to SKU lines only; they are a no-op on flat lines.
  if (line.flat) return;
  if (set.mode !== undefined) line.mode = set.mode;
  if (set.schedule !== undefined) line.schedule = set.schedule;
  if (set.qtyScale !== undefined) {
    for (const env of envs) {
      const current = line.qty[env];
      if (current !== undefined) line.qty[env] = current * set.qtyScale;
    }
  }
}

function applyOp(op: PatchOp, lines: Line[], optionEnvs: readonly string[]): void {
  if (op.set !== undefined) {
    const scopeEnvs = op.match.envs ?? optionEnvs;
    for (const line of lines) {
      if (matchesLine(op.match, line)) applySet(op.set, line, scopeEnvs);
    }
  }
  if (op.addLines !== undefined) {
    for (const extra of op.addLines) lines.push(cloneLine(extra));
  }
}

/**
 * Apply an option's enabled levers to a fresh copy of its lines and return the
 * result. Pure — the input option is never mutated. Levers are applied in
 * declaration order; each lever's patch ops are applied in order. A lever with
 * `enabled !== true` is a no-op.
 *
 * Levers are catalog-independent transforms (they set line-level mode/schedule
 * ids, scale quantities, or add lines), so this takes only the option.
 */
export function applyLevers(option: Option): Line[] {
  const lines: Line[] = option.lines.map(cloneLine);
  for (const lever of option.levers ?? []) {
    if (lever.enabled !== true) continue;
    for (const op of lever.patch) {
      applyOp(op, lines, option.environments);
    }
  }
  return lines;
}

// ── Headroom (P5) ─────────────────────────────────────────────────────────────

/**
 * Optimisation headroom for a set of lever-applied lines: the monthly saving
 * from moving steady, always-on, non-committed prod compute to the cheapest
 * committed pricing mode in the catalog.
 *
 * For each SKU line with `qty.prod > 0`, post-lever schedule pct ≥ 0.95, and a
 * post-lever mode that is NOT committed:
 *   saving = currentProdCost − sku.price * bestCommittedMult * qty.prod
 * where `bestCommittedMult` is the lowest `mult` among catalog pricing modes
 * with `committed: true`. Flat lines and lines with an unknown SKU are skipped.
 * The result is `max(0, Σ savings)`; 0 if the catalog has no committed mode.
 */
function computeHeadroom(lines: readonly Line[], catalog: Catalog): number {
  const index = catalogIndex(catalog);
  const bestCommittedMult = index.bestCommittedMult;
  if (bestCommittedMult === undefined) return 0;

  let savings = 0;
  for (const line of lines) {
    if (line.flat) continue;
    const prodQty = line.qty[PROD_ENV] ?? 0;
    if (prodQty <= 0) continue;
    const sku = index.skus.get(line.sku);
    if (sku === undefined) continue;

    const schedule = index.schedules.get(line.schedule) ?? DEFAULT_SCHEDULE;
    if (schedule.pct < STEADY_PCT) continue;
    const mode = index.modes.get(line.mode);
    if (mode?.committed === true) continue;

    const currentProdCost = lineEnvCost(line, PROD_ENV, catalog);
    const reserved = sku.price * bestCommittedMult * prodQty;
    savings += currentProdCost - reserved;
  }
  return Math.max(0, savings);
}

// ── Per-option and decision-level compute ────────────────────────────────────

/**
 * Compute the cost of one option: apply its levers, then cost every
 * lever-applied line across the option's active environments. `activeEnvs` is
 * the decision's environments filtered to the option's, preserving decision
 * order.
 */
export function computeOption(option: Option, decision: Decision, catalog: Catalog): OptionCost {
  const optionEnvs = new Set(option.environments);
  const activeEnvs = decision.spec.environments.filter((env) => optionEnvs.has(env));
  const lines = applyLevers(option);

  const perEnv: Record<string, number> = {};
  for (const env of activeEnvs) perEnv[env] = 0;

  const lineRows: LineRow[] = lines.map((line) => {
    const envCosts: Record<string, number> = {};
    for (const env of activeEnvs) {
      const cost = lineEnvCost(line, env, catalog);
      envCosts[env] = cost;
      perEnv[env] = (perEnv[env] ?? 0) + cost;
    }
    const monthly = activeEnvs.reduce((sum, env) => sum + (envCosts[env] ?? 0), 0);
    return { lineId: line.id, envCosts, monthly };
  });

  const monthly = activeEnvs.reduce((sum, env) => sum + (perEnv[env] ?? 0), 0);
  const annual = monthly * 12;
  const complete = option.complete !== false && monthly > 0;
  const headroom = computeHeadroom(lines, catalog);

  return { activeEnvs, perEnv, monthly, annual, lineRows, headroom, complete };
}

/**
 * Cost every option in a decision and pick the cheapest complete one.
 * `byOption` is keyed by option id in decision option order; `cheapestId` is the
 * complete option with the lowest `annual` (ties resolve to decision order), or
 * null if no option is complete.
 */
export function compute(decision: Decision, catalog: Catalog): DecisionCostResult {
  const byOption: Record<string, OptionCost> = {};
  for (const option of decision.spec.options) {
    byOption[option.id] = computeOption(option, decision, catalog);
  }

  let cheapestId: string | null = null;
  let cheapestAnnual = Infinity;
  for (const option of decision.spec.options) {
    const cost = byOption[option.id];
    if (cost === undefined || !cost.complete) continue;
    if (cost.annual < cheapestAnnual) {
      cheapestAnnual = cost.annual;
      cheapestId = option.id;
    }
  }

  return { byOption, cheapestId };
}
