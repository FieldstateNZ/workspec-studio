import type { Inventory, Spend, TagPlan } from '@workspec/cost-schema';
import type { ApplyResult, DriftReport } from './types.js';

// ── The provider PORT ───────────────────────────────────────────────────────
// The contract a real cloud backend (e.g. `@workspec/cost-provider-azure`)
// implements to feed inventory, spend, and tag-apply operations into the Cost
// Attribution engine and CLI — independent of any one cloud vendor's API
// shape. NO vendor-specific types appear anywhere in this file or in
// `./types.js`: that is the acceptance criterion this package exists to
// satisfy (see the package README).
//
// Deliberately SMALL, mirroring `@workspec/decision-schema`'s
// `DecisionRepositoryPort` pattern: exactly four methods, no
// watch/subscribe, no history. Each implementation owns its own pagination,
// retry, and auth concerns internally — none of that leaks through the port.

/** Which provider subscriptions (or equivalent account-scoping concept) an operation covers. */
export interface ProviderScope {
  /** Subscription ids/names in scope. Provider-neutral: a plain, non-empty list of strings. */
  subscriptions: string[];
}

/**
 * The cloud provider port. **Exactly four methods.** Any implementation
 * (the in-memory test double in `./memory.js`, `@workspec/cost-provider-azure`,
 * or a future provider for another cloud) provides these and only these;
 * extending the port is a deliberate cross-cutting change, not a local one.
 */
export interface CloudProviderPort {
  /**
   * Stock-take: return a schema-valid {@link Inventory} of every resource in
   * `scope`, as of the implementation's own clock (real time for a live
   * provider; injectable and deterministic for the memory double).
   */
  fetchInventory(scope: ProviderScope): Promise<Inventory>;

  /**
   * Return billed spend for `period` (an ISO month, `"YYYY-MM"`) across
   * `scope`, as a schema-valid {@link Spend}.
   */
  fetchSpend(scope: ProviderScope, period: string): Promise<Spend>;

  /**
   * Apply — or, when `options.dryRun` is true, only simulate — a
   * {@link TagPlan}'s tagging actions against live resources. `noop` entries
   * are always skipped (counted, never sent). Continues past a single
   * entry's failure so one bad resource doesn't abort the whole plan.
   *
   * `'remove'` entries are **value-matched**: an implementation must delete
   * the tag only if its current live value equals the entry's recorded
   * `current`, and must report the entry as a failure (`ok: false`, with an
   * `error` naming the mismatch) rather than deleting unconditionally or
   * silently no-op'ing when the live value has drifted since the plan was
   * computed. This mirrors Azure ARM's Tags Update-At-Scope `Delete`
   * operation, which itself matches on tag name AND value when a value is
   * supplied — see `@workspec/cost-provider-azure`'s README for why an
   * ungated apply against drifted live state is unsafe otherwise.
   */
  applyTags(plan: TagPlan, options?: { dryRun?: boolean }): Promise<ApplyResult>;

  /**
   * Compare the LIVE state of `baseline`'s resources — restricted to
   * `resourceIds` when given — against `baseline`'s own recorded tags.
   * Any difference (a resource that newly exists, one that's gone, or one
   * whose tags no longer match) becomes a {@link DriftReport} entry. This is
   * what the CLI calls before `apply`, refusing to proceed when live state
   * has drifted from the Inventory a TagPlan was computed against.
   */
  verifyBaseline(baseline: Inventory, resourceIds?: string[]): Promise<DriftReport>;
}

/** The exact method names of the port, as a runtime-checkable tuple. */
export const CLOUD_PROVIDER_METHODS = [
  'fetchInventory',
  'fetchSpend',
  'applyTags',
  'verifyBaseline',
] as const;
