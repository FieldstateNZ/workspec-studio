/** The closed set of diagnostic codes this package can raise. */
export type CostDiagnosticCode =
  | 'missing-sku'
  | 'missing-mode'
  | 'missing-schedule'
  | 'bad-attribution-shares';

/** Fields common to every diagnostic: which resource, and a human-readable explanation. */
interface CostDiagnosticBase {
  /** The resource that triggered this diagnostic. */
  readonly resourceSlug: string;
  /** Human-readable message. */
  readonly message: string;
}

/**
 * A resource's `cost.sku` does not resolve in `catalog.spec.skus`.
 * `lineEnvCost` prices this line as 0 (see its doc comment) — this
 * diagnostic is what makes that silent zero visible.
 */
export interface MissingSkuDiagnostic extends CostDiagnosticBase {
  readonly code: 'missing-sku';
  /** The unresolved sku ref as authored. */
  readonly ref: string;
}

/**
 * A resource's `cost.mode` does not resolve in `catalog.spec.pricingModes`.
 * `lineEnvCost` defaults an unresolved mode to PAYG (mult 1, non-committed)
 * — this diagnostic surfaces that fallback rather than letting it pass
 * unnoticed.
 */
export interface MissingModeDiagnostic extends CostDiagnosticBase {
  readonly code: 'missing-mode';
  /** The unresolved mode ref as authored. */
  readonly ref: string;
}

/**
 * A resource's `cost.schedule` does not resolve in `catalog.spec.schedules`.
 * `lineEnvCost` defaults an unresolved schedule to 24×7 (pct 1) — this
 * diagnostic surfaces that fallback rather than letting it pass unnoticed.
 */
export interface MissingScheduleDiagnostic extends CostDiagnosticBase {
  readonly code: 'missing-schedule';
  /** The unresolved schedule ref as authored. */
  readonly ref: string;
}

/**
 * A resource's `cost.attribution` shares do not sum to ~1. Per spec, this is
 * surfaced rather than silently renormalized — the shares are still applied
 * exactly as authored.
 */
export interface BadAttributionSharesDiagnostic extends CostDiagnosticBase {
  readonly code: 'bad-attribution-shares';
  /** The actual sum of the authored shares. */
  readonly sum: number;
}

/** One problem found while computing a topology's cost, keyed by `code`. */
export type CostDiagnostic =
  | MissingSkuDiagnostic
  | MissingModeDiagnostic
  | MissingScheduleDiagnostic
  | BadAttributionSharesDiagnostic;
