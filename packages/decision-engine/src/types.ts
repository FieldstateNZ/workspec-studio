// Engine result types. These describe the normative shape of the cost engine's
// output — the same structure any conforming implementation (a future Rust CLI,
// WorkSpec Enterprise) must produce for identical input.

/** Per-line, lever-applied cost across the option's active environments. */
export interface LineRow {
  /** The line id (stable within the option). */
  lineId: string;
  /** Monthly cost of this line per active environment. */
  envCosts: Record<string, number>;
  /** Sum of `envCosts` across the active environments. */
  monthly: number;
}

/** The computed cost of a single option (levers applied). */
export interface OptionCost {
  /**
   * The option's active environments, in the decision's environment order
   * (a subset of the decision environments).
   */
  activeEnvs: string[];
  /** Total monthly cost per active environment. */
  perEnv: Record<string, number>;
  /** Sum of `perEnv` — the option's total monthly cost. */
  monthly: number;
  /** `monthly * 12`. */
  annual: number;
  /** Per-line breakdown (lever-applied), in line order. */
  lineRows: LineRow[];
  /**
   * Optimisation headroom: the monthly saving available by moving steady,
   * always-on prod compute to the cheapest committed pricing mode. See the
   * package README for the normative rule (P5).
   */
  headroom: number;
  /** `option.complete !== false && monthly > 0` (P6). */
  complete: boolean;
}

/** The decision-level roll-up: every option's cost plus the cheapest complete one. */
export interface DecisionCostResult {
  /** Per-option cost, keyed by option id, in decision option order. */
  byOption: Record<string, OptionCost>;
  /** Id of the complete option with the lowest annual cost, or null if none complete. */
  cheapestId: string | null;
}

/** Which catalog-referencing field of a SKU line failed to resolve. */
export type RefField = 'sku' | 'mode' | 'schedule';

/** A dangling catalog reference found by `validateRefs`. */
export interface RefError {
  /** Id of the option containing the line. */
  optionId: string;
  /** Id of the line with the dangling reference. */
  lineId: string;
  /** The SKU-line field whose reference did not resolve. */
  field: RefField;
  /** The unresolved reference value as authored. */
  ref: string;
  /** Human-readable message. */
  message: string;
}
