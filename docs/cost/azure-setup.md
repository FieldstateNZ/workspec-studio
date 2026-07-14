# Azure setup

What `@workspec/cost-provider-azure` needs from a real Azure subscription: auth, roles, scope,
API versions, retry/backoff behavior, and the verify-before-apply drift gate. This is the doc
[`docs/cost/README.md`](README.md)'s quickstart points to for "the full auth story" — read it
before your first `workspec-cost stocktake` against a real subscription.

Everything below describes `packages/cost-provider-azure`'s actual, tested behavior (recorded
fixtures, zero live Azure calls in CI/`pnpm test`) — see that package's own
[README](../../packages/cost-provider-azure/README.md) for the implementation-level detail this
doc summarizes for an operator.

## Auth: the `DefaultAzureCredential` chain

`createAzureProvider` authenticates via `@azure/identity`'s `DefaultAzureCredential` unless you
inject your own `http` (the `AzureHttp` seam, `packages/cost-provider-azure/src/http.ts`) — there
is no separate WorkSpec-specific credential flow to configure. `DefaultAzureCredential` tries, in
order, the first credential source that succeeds:

1. **Environment variables** — `AZURE_CLIENT_ID` / `AZURE_TENANT_ID` / `AZURE_CLIENT_SECRET` (or
   `AZURE_CLIENT_CERTIFICATE_PATH`) for a service principal. This is the right choice for CI or a
   scheduled stock-take.
2. **Workload Identity** — when running in AKS/Kubernetes with workload identity federation
   configured.
3. **Managed Identity** — when running on an Azure compute resource (VM, App Service, Container
   Apps, Azure Functions) with a system- or user-assigned identity attached.
4. **Azure CLI** (`az login`) — the common local-dev path: run `az login` once, then
   `workspec-cost stocktake` picks up that session's token.
5. **Azure PowerShell**, then a couple of further fallbacks (Azure Developer CLI, interactive
   browser in some environments) — see `@azure/identity`'s own docs for the exhaustive, versioned
   order.

For a first local run, `az login` (then confirming `az account show` points at the subscription
you want) is the fastest path. For anything unattended (CI, a scheduled job), a service principal
via the environment-variable form is the supported path.

Tokens are acquired for the `https://management.azure.com/.default` scope and cached in-process,
refreshed a minute before expiry — a long-running `serve` process does not re-authenticate on
every request. **401s are never auto-refreshed or retried** — see "Retry and backoff" below.

## Required roles

| Operation                          | Role needed                                 |
| ----------------------------------- | -------------------------------------------- |
| `stocktake` (`fetchInventory`)       | `Reader` (Resource Graph read)               |
| `stocktake` (`fetchSpend`)           | `Reader` (or the narrower `Cost Management Reader`) |
| `apply`'s pre-flight (`verifyBaseline`) | `Reader` (Resource Graph read)            |
| `apply` (`applyTags`)                | `Tag Contributor` (or broader write access, e.g. `Contributor`) |

`validate`, `report`, and `plan` are all local — they only read the committed YAML artifacts in
your working tree and never call Azure. Only `stocktake` and `apply` touch a live subscription.

**Least privilege**: grant `Reader` for the read-only loop (`stocktake` → `validate` → `report` →
`plan`) and add `Tag Contributor` only when you're ready to actually run `apply`. `Tag
Contributor` grants write access to tags only — it cannot modify any other resource property.

## Scope

Every operation's scope is **one or more subscription ids**, passed as
`ProviderScope.subscriptions` (a plain string array). There is no resource-group- or
management-group-level scoping in this slice — `fetchInventory`/`fetchSpend`/`verifyBaseline` all
resolve against the full subscription(s) you name. The roles above need to be assigned at (or
inherited down to) that subscription scope for the identity `DefaultAzureCredential` resolves.

Resource Graph queries (`fetchInventory`, `verifyBaseline`) can span multiple subscriptions in one
call; Cost Management (`fetchSpend`) cannot — it issues one query per subscription and merges the
results (see "Pagination" below).

## API versions used

| Azure API                                  | api-version    |
| -------------------------------------------- | -------------- |
| Resource Graph `resources` query             | `2022-10-01`   |
| Cost Management `query`                      | `2024-08-01`   |
| ARM Tags "Update At Scope"                   | `2024-11-01`   |

These are pinned constants in the provider's source (`src/inventory.ts`, `src/spend.ts`,
`src/apply.ts`) — there is no CLI flag or config file to override them today. A version bump is a
code change to this package.

## Retry and backoff

Every request goes through `withRetry` (`src/http.ts`):

- Retries on **HTTP 429 or any 5xx**. A **401 is never retried** — it fails immediately and
  propagates as an error (the 60-second token-refresh margin covers the common expiry case, but
  not every race — e.g. a credential revoked server-side mid-process).
- Honors a `Retry-After` response header when present (seconds, or an HTTP-date).
- Otherwise backs off exponentially: `baseDelayMs * 2^attempt`, capped at `maxDelayMs`, jittered to
  `[50%, 100%]` of that value.
- Bounded by `maxAttempts` (default 5). Once exhausted, the last HTTP status is thrown as an
  `Error` — `stocktake`/`apply` surface that as a CLI failure (non-zero exit).

`sleep`/`jitter` are injectable on `createAzureProvider`'s options — that's how the package's own
retry tests run deterministically with no real waiting; you don't need to configure anything for
normal use.

## Pagination

- **Resource Graph** (`fetchInventory`, `verifyBaseline`): pages via `$skipToken` to exhaustion.
  Each page request is independent (only the current `$skipToken` is sent, never accumulated
  state), so a transient failure mid-page-walk only needs to retry that one page.
- **Cost Management** (`fetchSpend`): one query per subscription — Cost Management has no
  cross-subscription query — each paged via the response's `nextLink` to exhaustion. The
  `nextLink` is **not** GET-able (Cost Management returns HTTP 400 "Dataset is invalid or not
  supplied" for a GET against it), so the continuation is POSTed, re-sending the exact same query
  body as the original request.

## The verify-before-apply drift gate

`apply` never writes a live tag without first confirming nothing has drifted since the plan was
computed. The flow, in order:

1. Read the `TagPlan` you point `apply` at.
2. Find the `Inventory` matching the plan's recorded `baselineAsOf`.
3. Call the provider's `verifyBaseline` against **exactly the resources the plan touches** (not
   the whole subscription) — this is one batched Resource Graph query, not one call per resource.
4. `verifyBaseline` reports all three drift kinds it can detect from that one query: a resource's
   tags changed since the baseline, a resource disappeared, or a resource that wasn't in the
   baseline now exists in scope.
5. **If any drift is found, `apply` refuses** — it exits non-zero and prints a drift summary
   instead of touching anything live. This is the whole point of the gate: a plan computed against
   stale state must not silently apply against today's (different) live state.
6. Only when verification finds zero drift does `apply` call `applyTags`.

### Tag removal is value-matched, not name-matched

ARM's Tags "Update At Scope" `Delete` operation matches on tag **name AND value** whenever a value
is supplied, not name alone — deleting a tag whose live value doesn't match the value in the
request is a no-op on Azure's side, not a delete. `applyAzureTags` sends the entry's own recorded
`current` value as that value specifically because of this, and specifically because the
verify-before-apply gate above has already confirmed live state matches the baseline the plan was
computed against. Without that gate, a drifted live value would make an ungated `Delete` silently
survive on the resource while reporting `ok: true` — the gate is the defense against exactly that.

### `--dry-run`

```
workspec-cost apply <tagplan-ref> --dry-run
```

Runs the identical verify-before-apply gate (so a dry run still tells you about drift), but
`applyTags` simulates every add/change/remove entry as successful without ever issuing the PATCH —
no live mutation happens. Use this to preview an apply's summary line
(`apply: N applied · M noop · K failed`) before committing to it for real.

## Live-check items still unconfirmed against a real tenant

`packages/cost-provider-azure`'s test suite replays committed JSON fixtures through a fake
`AzureHttp` — every test result is deterministic and **zero live Azure calls happen in CI or
`pnpm test`**. That gives high confidence in the schema-valid, byte-stable output shape, but a
short list of real-wire-format judgment calls (flagged in code comments, from training knowledge
rather than a verified live response) still need confirming against an actual tenant before this
adapter is trusted in production:

1. **The Cost Management currency column name.** `src/spend.ts` maps response rows by **column
   name** (never by position — column order is documented to depend on the requested `grouping`).
   The currency column isn't one this package explicitly requests in its `dataset`; Cost
   Management is understood to append one automatically, but which name it actually uses
   (`Currency` vs `BillingCurrencyCode` vs `PricingCurrencyCode`) wasn't fully verifiable from
   docs alone. All three are tried; if none match, a placeholder
   (`UNKNOWN_CURRENCY_PLACEHOLDER = "XXX"`, schema-valid but obviously not a real currency) is used
   so a live-check run surfaces the gap immediately rather than silently mis-attributing currency.
2. **Cost Management's `timePeriod` format.** `monthRange` in `src/spend.ts` sends full ISO
   datetimes (first instant of the month to the last millisecond of the month) rather than
   date-only strings — both forms appear in different Azure documentation examples. A live-check
   run against a real Cost Management endpoint should confirm the service accepts (and correctly
   scopes) the datetime form as sent.
3. **Per-entry ARM error detail on a failed `apply`.** `applyAzureTags` (`src/apply.ts`) records a
   failed PATCH as `error: "HTTP {status}"` only — it does not parse the response body for ARM's
   own `{ error: { code, message } }` shape. A live-check (or a real `apply` failure) should
   confirm whether the bare HTTP status is enough operator signal, or whether a future revision
   should surface the parsed ARM error code/message per failed entry too.

None of these affect the acceptance bar that already holds today (schema-valid output, no Azure
types leaking into the port, byte-stable serialization) — they only affect how faithfully this
adapter matches Azure's real behavior once it's pointed at production data.

### Running the live-check

```bash
WORKSPEC_COST_LIVE_CHECK=1 WORKSPEC_COST_LIVE_CHECK_SUBSCRIPTION=<sub-id> \
  pnpm --filter @workspec/cost-provider-azure live-check
```

`scripts/live-check.ts` (run via `tsx`) is the **only** place a real Azure call can happen from
this package. It's guarded by `WORKSPEC_COST_LIVE_CHECK=1` and is not wired into `pnpm test`,
`pnpm build`, `pnpm typecheck`, `pnpm lint`, or any CI workflow — running it with no env vars set
is a safe no-op. It exercises `fetchInventory`, `fetchSpend` (current month), `verifyBaseline`
(against the inventory it just fetched), and `applyTags` with an empty, `dryRun: true` plan — it
never mutates real tags. Confirming the three items above is exactly what this script is for; see
[`launch-checklist.md`](launch-checklist.md) for when to run it as part of shipping this module.
