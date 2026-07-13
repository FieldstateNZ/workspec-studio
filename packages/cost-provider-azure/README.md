# @workspec/cost-provider-azure

An Azure implementation of `@workspec/cost-provider`'s `CloudProviderPort` — Resource Graph for
inventory + drift verification, Cost Management for spend, and ARM's "Tags - Update At Scope" for
apply — so the Cost Attribution engine and CLI never contain Azure-specific code themselves.

Part of the Cost Attribution module (in progress — see issues C0–C7). This is the C3 slice.

**Node-only package** (`engines.node >= 22`, for global `fetch`) — unlike `@workspec/cost-provider`,
this package makes no browser-safety claim.

## Design decision: no `@azure/arm-*` SDKs

This package deliberately does **not** depend on the heavyweight `@azure/arm-resourcegraph`,
`@azure/arm-costmanagement`, or `@azure/arm-resources` SDKs. It uses `@azure/identity`
(`DefaultAzureCredential`) for auth **only**, and issues plain REST calls against ARM endpoints via
global `fetch`, behind an injectable `AzureHttp` seam (`src/http.ts`). That seam is what makes the
whole test suite run against **recorded fixtures, with zero live Azure calls** — see "Testing"
below.

## Auth

`createDefaultAzureHttp` (used by `createAzureProvider` unless you inject your own `http`)
authenticates via `DefaultAzureCredential`'s standard chain — environment variables, Workload
Identity, Managed Identity, Azure CLI (`az login`), Azure PowerShell, and so on, in that order, per
`@azure/identity`'s own documented behavior. Tokens are acquired for the
`https://management.azure.com/.default` scope and cached in-process (refreshed a minute before
expiry) so a long-running process doesn't re-authenticate on every call.

### Required roles

| Operation                          | Role needed                                  |
| ----------------------------------- | --------------------------------------------- |
| `fetchInventory`, `verifyBaseline`  | `Reader` (Resource Graph read)                |
| `fetchSpend`                        | `Reader` (or `Cost Management Reader`)         |
| `applyTags`                         | `Tag Contributor` (or broader write access)   |

Scope is one or more subscription ids, passed as `ProviderScope.subscriptions`.

## Apply semantics: tag removal is value-matched, not name-matched

ARM's Tags Update-At-Scope `Delete` operation matches on tag **name AND value** whenever a value is
supplied — not name only. Deleting a tag whose live value doesn't match the value in the request is a
no-op on Azure's side, not a delete. `applyAzureTags` (`src/apply.ts`) sends the entry's own recorded
`current` value as that value precisely *because* of this: it's a deliberate value-matched delete,
gated by `verifyBaseline` having already confirmed live state matches the Inventory the plan was
computed against.

The risk this design guards against: if `apply` were ever run without that verify-before-apply gate,
and live had drifted since the plan was computed (someone hand-edited the tag outside WorkSpec), an
ungated Delete against the drifted value would report `ok: true` while the tag silently survives on
the resource. The CLI's verify-before-apply step is the defense against exactly this — see
`@workspec/cost-provider`'s README for the same contract on the in-memory test double.

## API versions used

| Azure API                                  | api-version    |
| -------------------------------------------- | -------------- |
| Resource Graph `resources` query             | `2022-10-01`   |
| Cost Management `query`                      | `2024-08-01`   |
| ARM Tags "Update At Scope"                   | `2024-11-01`   |

## Rate limits & retry/backoff

Every request goes through `withRetry` (`src/http.ts`): on HTTP 429 or any 5xx, it honors a
`Retry-After` response header when present (seconds or an HTTP-date), otherwise backs off
exponentially (`baseDelayMs * 2^attempt`, capped at `maxDelayMs`, jittered to `[50%, 100%]` of that
value). Bounded by `maxAttempts` (default 5); once exhausted, the last status is thrown as an
`Error`. `sleep` and `jitter` are injectable on `createAzureProvider`'s options, which is what makes
the retry tests deterministic (no real waiting).

**401s are never auto-refreshed or retried.** `withRetry` only retries 429/5xx (see `isRetryableStatus`
in `src/http.ts`) — a 401 fails loud and propagates as-is. The token cache's 60-second refresh margin
(see "Auth" above) covers the common case of a token expiring mid-process, but doesn't eliminate every
race (e.g. a credential revoked server-side between the cache check and the request landing).

## Pagination

- **Resource Graph** (`fetchInventory`, `verifyBaseline`): pages via `$skipToken` to exhaustion.
  Resumable in the sense that each page is requested independently — the request body only ever
  carries the *current* `$skipToken`, never accumulated state from prior pages.
- **Cost Management** (`fetchSpend`): one query per subscription (Cost Management has no
  cross-subscription query, unlike Resource Graph), each paged via the response's `nextLink` to
  exhaustion. The `nextLink` is **not** GET-able — Cost Management returns HTTP 400 "Dataset is
  invalid or not supplied" for a GET (verified against azure-rest-api-specs issue #12276) — so the
  continuation is POSTed, re-sending the exact same query body as the original request.

## Judgment calls flagged for review

A few Azure wire-format details could not be fully verified against live API docs from training
knowledge alone, and are called out in code comments where they matter most:

- **Cost Management response column mapping** (`src/spend.ts`): rows are mapped by **column name**
  (`properties.columns[].name`, case-insensitive), never by position, since column order is
  documented to depend on the requested `grouping`. The currency column is not one this package
  explicitly requests in `dataset` — Cost Management is understood to append one automatically, but
  the exact name (`Currency` vs `BillingCurrencyCode` vs `PricingCurrencyCode`) wasn't fully
  verifiable, so all three are tried and a placeholder (`UNKNOWN_CURRENCY_PLACEHOLDER = "XXX"`,
  schema-valid but obviously not a real currency) is used as a last resort so a `live-check` run
  surfaces the gap immediately.
- **Cost Management `timePeriod` format** (`src/spend.ts`'s `monthRange`): full ISO datetimes
  (first instant of the month to the last millisecond of the month) rather than date-only strings —
  both forms appear in different Azure documentation examples.

None of these affect the acceptance criteria (schema-valid, byte-stable output; no Azure types in
the port) — they matter only for how faithfully this adapter matches Azure's real behavior, and
should be confirmed with a `live-check` run (below) before this adapter is trusted against
production Azure data.

## Manual live-Azure check

```bash
WORKSPEC_COST_LIVE_CHECK=1 WORKSPEC_COST_LIVE_CHECK_SUBSCRIPTION=<sub-id> \
  pnpm --filter @workspec/cost-provider-azure live-check
```

`scripts/live-check.ts` (run via `tsx`) is the **only** place a real Azure call can happen from this
package. It is guarded by `WORKSPEC_COST_LIVE_CHECK=1` and is **not** wired into `pnpm test`,
`pnpm build`, `pnpm typecheck`, `pnpm lint`, or any CI workflow — running it with no env vars set is
a safe no-op. It exercises `fetchInventory`, `fetchSpend` (current month), `verifyBaseline` (against
the inventory it just fetched), and `applyTags` with an empty, `dryRun: true` plan — it never mutates
real tags.

## Testing

Every test replays committed JSON fixtures (`test/fixtures/*.json`) through a fake `AzureHttp`
(`test/support/fixture-http.ts`) — **no live Azure call ever runs in CI or `pnpm test`**. Covered:

- multi-page Resource Graph inventory (pagination, id-lowercasing, tag omission when empty/null)
- Cost Management spend mapping (unresolved rows, currency-column lookup, per-subscription
  querying + merge, `nextLink` pagination)
- 429-then-success retry/backoff, with deterministic injected `sleep`/`jitter`
- `applyTags` grouping (add/change → Merge, remove → Delete), `noop` skipping, `dryRun`, and
  continuing past a per-resource failure
- `verifyBaseline` detecting all three drift kinds from one batched query
- byte-stability: two identical fetches (fixed clock) serialize identically via
  `@workspec/cost-schema`'s `serializeInventoryYaml`/`serializeSpendYaml`

## Dependency direction

`cost-provider-azure` depends on `cost-provider` and `cost-schema` ONLY — never on `cost-engine`,
`cost-ui`, or `cost-studio`.
