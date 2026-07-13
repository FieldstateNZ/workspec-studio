import type { TokenCredential } from '@azure/identity';
import type { CloudProviderPort, ProviderScope } from '@workspec/cost-provider';
import { applyAzureTags } from './apply.js';
import { fetchAzureInventory } from './inventory.js';
import { fetchAzureSpend } from './spend.js';
import { verifyAzureBaseline } from './verify.js';
import { createDefaultAzureHttp, withRetry } from './http.js';
import type { AzureHttp, RetryOptions } from './http.js';

export const COST_PROVIDER_AZURE_PACKAGE = '@workspec/cost-provider-azure' as const;

// ── Re-exports ───────────────────────────────────────────────────────────
export type { AzureHttp, AzureHttpRequest, AzureHttpResponse, RetryOptions } from './http.js';
export { createDefaultAzureHttp, withRetry } from './http.js';
export type { FetchInventoryOptions } from './inventory.js';
export { fetchAzureInventory, RESOURCE_GRAPH_URL } from './inventory.js';
export type { FetchSpendOptions } from './spend.js';
export { fetchAzureSpend, UNKNOWN_CURRENCY_PLACEHOLDER } from './spend.js';
export type { ApplyAzureTagsOptions } from './apply.js';
export { applyAzureTags } from './apply.js';
export type { VerifyAzureBaselineOptions } from './verify.js';
export { verifyAzureBaseline } from './verify.js';

/** Options for {@link createAzureProvider}. Everything is optional and injectable, for both production wiring and deterministic tests. */
export interface CreateAzureProviderOptions {
  /** Supply a fake/replay `AzureHttp` in tests. Defaults to `createDefaultAzureHttp(credential)`. */
  http?: AzureHttp;
  /** Passed to `createDefaultAzureHttp` when `http` is not supplied. Defaults to `new DefaultAzureCredential()`. Ignored if `http` is given. */
  credential?: TokenCredential;
  /** Clock for `fetchInventory`'s `spec.asOf`. Defaults to real wall-clock time. */
  clock?: () => string;
  /** Injectable sleep for the retry/backoff wrapper (see `./http.js`). Defaults to a real `setTimeout`-backed sleep. */
  sleep?: RetryOptions['sleep'];
  /** Injectable jitter source for the retry/backoff wrapper. Defaults to `Math.random`. */
  jitter?: RetryOptions['jitter'];
  /** Max attempts for the retry/backoff wrapper. Defaults to 5. */
  maxAttempts?: RetryOptions['maxAttempts'];
}

/**
 * Build a `CloudProviderPort` backed by real Azure REST calls: Resource
 * Graph for inventory and drift verification, Cost Management for spend, and
 * ARM's "Tags - Update At Scope" for apply. Every HTTP call goes through the
 * same `AzureHttp` (auth + retry/backoff applied once, here), which is what
 * lets tests substitute a fixture-replay `AzureHttp` for the whole port at
 * once — see `test/` for the recorded-fixture test suite.
 */
export function createAzureProvider(options: CreateAzureProviderOptions = {}): CloudProviderPort {
  const rawHttp = options.http ?? createDefaultAzureHttp(options.credential);
  const http = withRetry(rawHttp, {
    ...(options.sleep !== undefined ? { sleep: options.sleep } : {}),
    ...(options.jitter !== undefined ? { jitter: options.jitter } : {}),
    ...(options.maxAttempts !== undefined ? { maxAttempts: options.maxAttempts } : {}),
  });
  const clock = options.clock;

  return {
    fetchInventory(scope: ProviderScope) {
      return fetchAzureInventory(scope, { http, ...(clock !== undefined ? { clock } : {}) });
    },
    fetchSpend(scope: ProviderScope, period: string) {
      return fetchAzureSpend(scope, period, { http });
    },
    applyTags(plan, applyOptions) {
      return applyAzureTags(plan, { http, ...(applyOptions?.dryRun !== undefined ? { dryRun: applyOptions.dryRun } : {}) });
    },
    verifyBaseline(baseline, resourceIds) {
      return verifyAzureBaseline(baseline, resourceIds, { http });
    },
  };
}
