// Engine result types. These describe the normative shape of the cost
// attribution engine's output — the same structure any conforming
// implementation (a future Rust CLI, WorkSpec Enterprise) must produce for
// identical input. See the package README for the full semantics (matching,
// per-dimension precedence, coverage, splits, diagnostics).

// ── Per-dimension assignment ─────────────────────────────────────────────

/** A resolved literal value on one dimension. */
export interface ValueAssignment {
  kind: 'value';
  value: string;
  /** Winning rule id, or `'override'` when a pinned override set this value. */
  provenance: string;
}

/** One part of a ratio split on one dimension. */
export interface SplitPart {
  value: string;
  ratio: number;
}

/**
 * A resolved ratio split across two or more values on one dimension.
 * Overrides never split — `Override.assign` (cost-schema) is literal-only —
 * so `provenance` here is always a rule id, never `'override'`.
 */
export interface SplitAssignment {
  kind: 'split';
  parts: SplitPart[];
  provenance: string;
}

/** A resource's resolved value on one dimension: a literal or a ratio split. */
export type DimensionAssignment = ValueAssignment | SplitAssignment;

// ── Cascade trace (drives the C5 workbench's cascade/"Why" UI) ──────────────

/** A dimension a rule targeted but lost, naming the earlier rule that won it. */
export interface ShadowedDimension {
  dimensionId: string;
  winnerRuleId: string;
}

/**
 * One matching rule's contribution to a single resource's resolution.
 * `tookDimensions` and `shadowed` are sorted by dimension declaration order
 * (`Attribution.spec.dimensions[]` index), not insertion order.
 */
export interface RuleTraceEntry {
  ruleId: string;
  /** Dimensions this rule was first to assign on this resource. */
  tookDimensions: string[];
  /** Dimensions this rule targeted (via assign/split/fromTag) but which an earlier rule already assigned. */
  shadowed: ShadowedDimension[];
}

/**
 * The trailing override trace entry. Overrides always win unconditionally —
 * there is no "shadowed" concept for an override, and nothing can shadow one.
 */
export interface OverrideTraceEntry {
  tookDimensions: string[];
}

/** One resource's full resolution: per-dimension assignment plus cascade trace. */
export interface ResourceResolution {
  resourceId: string;
  /** Per-dimension assignment, keyed by dimension id. A missing key means the dimension is unresolved. */
  assignments: Record<string, DimensionAssignment>;
  /**
   * Ordered over matching rules only, in evaluation order. Non-matching
   * rules are omitted here and counted in `didNotMatchCount` instead — this
   * is what lets the UI render "n rules did not match" without listing them.
   */
  trace: RuleTraceEntry[];
  /** Count of rules that did not match this resource. */
  didNotMatchCount: number;
  /** Present iff a pinned override targets this resource. */
  overrideTrace?: OverrideTraceEntry;
}

// ── Rule stats ───────────────────────────────────────────────────────────

/** Per-rule match/win counts across the whole inventory. */
export interface RuleStat {
  ruleId: string;
  /** Number of resources this rule matched (its `match` condition held). */
  matched: number;
  /** Number of resources where this rule set (won) at least one dimension. */
  won: number;
}

// ── Diagnostics ──────────────────────────────────────────────────────────

/** The full diagnostic-code catalog. See the README for when each fires. */
export type DiagnosticCode =
  | 'rule-never-matched'
  | 'rule-never-won'
  | 'unknown-dimension-value'
  | 'override-unknown-resource'
  | 'orphan-spend-row'
  | 'mixed-currency'
  | 'reserved-dimension-value';

export type DiagnosticSeverity = 'info' | 'warning' | 'error';

/** A structured diagnostic. The engine never throws — problems surface here instead. */
export interface Diagnostic {
  code: DiagnosticCode;
  severity: DiagnosticSeverity;
  message: string;
  ruleId?: string;
  resourceId?: string;
  dimensionId?: string;
}

// ── resolveAttribution ───────────────────────────────────────────────────

export interface ResolveAttributionResult {
  /** One entry per inventory resource, in inventory order. */
  resolutions: ResourceResolution[];
  /** Per-rule match/win counts, keyed by rule id. */
  ruleStats: Record<string, RuleStat>;
  diagnostics: Diagnostic[];
}

// ── Coverage / rollups / cross-tabs ──────────────────────────────────────

/** Attribution coverage for one dimension. */
export interface Coverage {
  dimensionId: string;
  /** True iff this is `dimensions[0]` — the headline coverage number. */
  isPrimary: boolean;
  attributedSpend: number;
  unattributedSpend: number;
  /**
   * `attributedSpend / totalSpend`; `1` when `totalSpend` is `0` (no division
   * by zero). This is raw, UNCLAMPED math — display layers may clamp for
   * presentation, but this field never does. `Spend.amount` may be negative
   * (the schema allows credits/refunds), so `attributedSpend`,
   * `unattributedSpend`, and `totalSpend` can each be negative, and `ratio`
   * can fall outside `[0, 1]` — e.g. a net-negative (credit-heavy)
   * unattributed bucket can push `ratio` above `1`. See the README's
   * "Credits and edge cases" note (§6).
   */
  ratio: number;
  unattributedCount: number;
  /** The spend joined to inventory resources (`totals.inventorySpend`) — the coverage/rollup denominator. */
  totalSpend: number;
}

/** One bucket in a rollup: a declared dimension value id, or `'unattributed'`. */
export interface RollupBucket {
  key: string;
  amount: number;
}

/** A dimension's spend rollup, splits distributed by ratio, including an `'unattributed'` bucket. */
export interface Rollup {
  dimensionId: string;
  buckets: RollupBucket[];
}

export interface CrossTabCell {
  rowKey: string;
  colKey: string;
  amount: number;
}

/**
 * A dimension × dimension cross-tab, splits distributed by ratio on both
 * axes. `cells` order is an implementation detail, not part of the normative
 * contract: conforming implementations must match the `(rowKey, colKey) ->
 * amount` mapping, not the array's iteration order.
 */
export interface CrossTab {
  rowDimensionId: string;
  colDimensionId: string;
  cells: CrossTabCell[];
}

/** Spend totals, split by how the engine could account for each row. */
export interface Totals {
  /** Sum of `amount` across every spend row passed in (inventory-joined + orphan + unresolved). */
  totalSpend: number;
  /** Sum of `amount` for rows joined to a known inventory resource — the rollup/coverage denominator. */
  inventorySpend: number;
  /** Sum of `amount` for rows whose `resourceId` is not a known inventory resource. */
  orphanSpend: number;
  /** Sum of `amount` for rows marked `unresolved: true`. */
  unresolvedSpend: number;
  /** Inventory resources with zero matching spend rows (attributed trivially at $0; not a diagnostic). */
  resourcesWithoutSpend: number;
  /** Every distinct currency code seen across all spend rows, sorted ascending. */
  currencies: string[];
}

/** One spend row whose `resourceId` did not match any inventory resource. */
export interface OrphanSpendRow {
  resourceId: string;
  amount: number;
  currency: string;
  period: string;
  serviceCategory: string;
}

export interface Orphans {
  rows: OrphanSpendRow[];
  totalAmount: number;
}

/** The full result of `attribute()` — everything the C5 workbench needs, precomputed. */
export interface AttributeResult {
  resolutions: ResourceResolution[];
  ruleStats: Record<string, RuleStat>;
  /** Per-resource summed spend, for every inventory resource (`0` if it has no matching rows). */
  resourceSpend: Record<string, number>;
  /** One entry per declared dimension, in declaration order. */
  coverage: Coverage[];
  primaryDimensionId: string;
  /** One entry per declared dimension, in declaration order (`rollupBy` precomputed). */
  rollups: Rollup[];
  /** Primary × each other dimension, in dimension declaration order. Use `crossTab()` directly for any other pair. */
  crossTabs: CrossTab[];
  totals: Totals;
  orphans: Orphans;
  diagnostics: Diagnostic[];
}

// ── plan / buildTagPlan ──────────────────────────────────────────────────

/** Dimension id → tag name mapping, e.g. `{ product: 'fs-product' }`. */
export type TagMapping = Record<string, string>;
