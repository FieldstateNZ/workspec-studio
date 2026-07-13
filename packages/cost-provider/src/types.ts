import type { TagPlanEntryType } from '@workspec/cost-schema';

// ── Result types for the provider port ──────────────────────────────────────
// Plain data, no vendor types: these are what `applyTags` and `verifyBaseline`
// return (see `./port.ts`).

/**
 * Outcome of applying (or, in a dry run, simulating) one TagPlan entry — one resource × tag.
 *
 * For `action: 'remove'`, a compliant `CloudProviderPort.applyTags` implementation is
 * **value-matched**: it deletes the tag only when its current live value equals this entry's
 * recorded `current`, and reports `ok: false` (with `error` naming the mismatch) rather than
 * deleting unconditionally when live has drifted since the plan was computed.
 */
export interface ApplyEntryResult {
  /** The resource this entry concerned. */
  resourceId: string;
  /** The tag name this entry concerned. */
  tag: string;
  /** The tagging action attempted — mirrors the TagPlan entry's own `action`. */
  action: TagPlanEntryType['action'];
  /** Whether this entry's action succeeded (or, in a dry run, would have). */
  ok: boolean;
  /** Present only when `ok` is false: what went wrong. */
  error?: string;
}

/** Outcome of an `applyTags` call across every entry in a TagPlan. */
export interface ApplyResult {
  /** One result per TagPlan entry, in the plan's `spec.entries[]` order. */
  results: ApplyEntryResult[];
  /** Count of entries actually applied: `action !== 'noop' && ok`. */
  applied: number;
  /** Count of entries that failed (`ok === false`), of any action. */
  failed: number;
  /** Count of entries skipped because their action was already `'noop'`. */
  skippedNoop: number;
  /** True if this call only simulated the plan — no live resource was mutated. */
  dryRun: boolean;
}

/**
 * One detected difference between a baseline Inventory and live provider
 * state, produced by `verifyBaseline`.
 *
 * - `'resource-appeared'` — the resource exists live now but was not
 *   recorded in the baseline (only possible when the caller's `resourceIds`
 *   restriction names an id outside the baseline's own resources).
 * - `'resource-disappeared'` — the resource was recorded in the baseline but
 *   no longer exists live.
 * - `'tags-changed'` — the resource exists in both, but its live tags differ
 *   from the baseline's recorded tags.
 */
export interface Drift {
  kind: 'resource-appeared' | 'resource-disappeared' | 'tags-changed';
  /** The resource id this drift concerns. */
  resourceId: string;
  /** Human-readable description of the difference. */
  detail: string;
}

/** Result of `verifyBaseline`: whether live state matches the baseline, and every difference found. */
export interface DriftReport {
  /** True iff `drifts` is empty. */
  inSync: boolean;
  /** Every detected difference. Empty when `inSync`. */
  drifts: Drift[];
}
