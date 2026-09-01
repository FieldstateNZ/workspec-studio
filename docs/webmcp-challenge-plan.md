# WebMCP Challenge plan: WorkSpec Cost Copilot

Status: implementation-ready
Entry URL: `https://studio.workspec.io/cost/demo/`
Deadline: 2026-09-04 08:00 NZST (2026-09-03 13:00 PT)

## Product thesis

Turn the existing Cost Studio demo into a shared human-agent FinOps workbench. The page starts with a realistic 80-resource Azure estate at 81.2% product-attribution coverage. A ChatGPT browsing agent can inspect the gaps, preview a safe rule with exact spend/coverage impact, and apply the reviewed rule into the same in-browser repository and UI the human is viewing.

The memorable proof is one sentence:

> Ask the agent to close the attribution gaps; watch the live workbench move from 81.2% to 100% without leaving the page.

This is a stronger challenge entry than exposing all existing MCP operations. It is narrow, visual, useful, and demonstrates the reason for WebMCP: the agent and human share page state, permissions, validation, and feedback.

## Scope

### Ship

- Five imperative WebMCP tools registered from the top-level `/cost/demo/` page.
- A baseline demo state with 81.2% primary-dimension coverage and three unattributed resource-group clusters.
- An enforced inspect/preview/apply flow for appending one validated product-attribution rule.
- Immediate synchronization between a successful agent write and the existing Cost Studio React UI.
- A compact, visible agent-activity strip that distinguishes inspection, preview, application, errors, and unsupported browsers.
- A real static `/cost/demo/index.html` build artifact so the submission URL returns HTTP 200 on GitHub Pages.
- Focused unit/integration tests, a production build, live WebMCP verification, a short demo video, and submission copy.

### Do not ship in this sprint

- A new chat UI; ChatGPT's browser is the agent surface.
- WebMCP coverage for Decisions, C4, Traceability, or all 48 conventional MCP tools.
- Arbitrary matcher/rule authoring, deletion, reordering, file-system writes, authentication, or a backend.
- A new hosting stack or a rewrite of `@workspec/cost-ui`.
- Declarative form or iframe tools; ChatGPT's current browser requires top-level JavaScript registration.

## Golden demo state

The baseline fixture already proves these figures in `cost-engine`/`cost-ui` tests:

| State                                  | Coverage | Unattributed resources | Unattributed spend |
| -------------------------------------- | -------: | ---------------------: | -----------------: |
| Start                                  |    81.2% |                     20 |          $2,474/mo |
| Add `r9`: `rg-legacy-misc -> shared`   |    90.0% |                      8 |          $1,315/mo |
| Add `r10`: `rg-client-acme -> shared`  |    96.1% |                      3 |            $520/mo |
| Add `r11`: `rg-client-kauri -> shared` |   100.0% |                      0 |              $0/mo |

Cluster details, sorted by monthly spend:

| Resource group    | Resources |     Spend |
| ----------------- | --------: | --------: |
| `rg-legacy-misc`  |        12 | $1,159/mo |
| `rg-client-acme`  |         5 |   $795/mo |
| `rg-client-kauri` |         3 |   $520/mo |

The existing vendored site attribution currently contains `r9`-`r11`. Remove those three rules from the demo YAML so Reset always restores the 81.2% baseline. Keep the engine fixture and package versions unchanged.

## WebMCP contract

Register tools with `document.modelContext.registerTool()` only when the API exists. All schemas are closed objects with `additionalProperties: false`. All handlers read the repository at execution time; they must not capture a stale attribution document.

### 1. `get_cost_overview`

Read-only. No inputs.

Returns the current estate/ref, period, currency, resource count, total spend, primary dimension and allowed values, rule count, primary coverage (ratio/count/spend), and diagnostic count.

### 2. `list_unattributed_clusters`

Read-only. No inputs.

Returns current primary-dimension gaps sorted by spend descending. Each cluster contains `resourceGroup`, `resourceCount`, `monthlySpend`, and a short suggested next action. Also return the primary dimension and its allowed values so the agent does not invent values.

### 3. `inspect_unattributed_cluster`

Read-only. Input:

- `resourceGroup`: required non-empty string, maximum 128 characters.

Reject a group that is not currently unattributed. Return cluster totals and its resource rows (`name`, `type`, spend, tags, and any assignments on other dimensions), plus allowed product values. Keep the result bounded to the resources in that cluster.

### 4. `preview_attribution_rule`

Read-only in its persisted-state semantics. Inputs:

- `resourceGroup`: required non-empty string, maximum 128 characters.
- `value`: required enum from the page's primary dimension (`workspec`, `atrium`, `coffers`, `shared` for this fixture).

Re-read all artifacts, confirm the group is still unattributed, construct the next append-only rule with the existing `nextRuleId()` and `buildPromotedRule()` helpers, and run the real `attribute()` engine against a cloned attribution. Return:

- an opaque `proposalId`;
- exact proposed rule fields;
- before/after coverage;
- newly attributed count and monthly spend;
- remaining unattributed clusters;
- `persisted: false`.

Store the proposal in the page-local service with a fingerprint of the current rule list. Update the activity strip to show the preview, but do not write the repository or Query cache.

### 5. `apply_attribution_rule`

Mutating. Input:

- `proposalId`: required non-empty string returned by `preview_attribution_rule`.

The description must explicitly say that this writes an attribution rule to the current in-browser demo. Require a known proposal, re-read the attribution, reject a stale fingerprint, revalidate the group/value, recompute the projection, write through `CostRepositoryPort.writeAttribution()`, and update the existing TanStack Query cache with `attributionKey(repository, ref)`. Return the created rule, exact before/after figures, remaining gaps, and `persisted: true`. Consume the proposal after success so an accidental retry cannot append a duplicate.

Use `annotations: { readOnlyHint: true }` on the first four tools and `readOnlyHint: false` on apply. Outputs contain only trusted local fixture/domain data, not external or user-authored instructions.

## Page behavior

The existing human UI remains authoritative and fully usable. Add one small status surface above the Cost app:

- Unsupported: "WebMCP is available when this page is opened in a supported ChatGPT browser."
- Ready: "Agent tools ready - 5 site tools share this in-browser estate."
- Preview: "Preview only - rg-legacy-misc -> shared - 81.2% to 90.0% - no changes yet."
- Applied: "Applied r9 - 12 resources and $1,159/mo newly attributed."
- Error: a concise safe error with no stack trace.

Keep `Fix coverage`, rule editing, Export CSV, and Reset. Reset must create a new repository and QueryClient, clear activity/proposals, unregister the old tools, and register tools for the fresh 81.2% state.

React Strict Mode is enabled. Register all five tools in one effect with one `AbortController`; pass its signal to every registration, catch registration rejection during abort/remount, and abort on cleanup. Never leave duplicate registrations behind.

## Implementation map

### Domain and WebMCP bridge

- Add `apps/site/src/cost-webmcp.ts`.
  - Pure snapshot/cluster/preview/apply service over `CostRepositoryPort`.
  - Tool definitions and closed JSON schemas.
  - Page-local proposal map and rule-list fingerprint.
  - Registration helper returning cleanup through `AbortController`.
- Add `apps/site/src/webmcp.d.ts`.
  - Minimal ambient types for the experimental `Document.modelContext` surface; do not add a runtime dependency.
- Add `apps/site/src/cost-webmcp.test.ts`.
  - Exercise the pure service directly and registration with a mocked model context.

### Demo integration

- Update `apps/site/src/examples-cost/fieldstate-azure.attribution.yaml` to remove `r9`-`r11`.
- Update `apps/site/src/cost-seed.ts` comments to describe the 81.2% starting state.
- Update `apps/site/src/cost-demo.tsx`.
  - Create an explicit `QueryClient` alongside the repository per `resetToken`.
  - Pass it to `CostStudioProvider`.
  - Register the WebMCP bridge against the repository and QueryClient.
  - Render the agent-activity strip.
  - Reset repository, QueryClient, proposal/activity state, and registration together.
- Update `apps/site/src/styles.css` with responsive status-strip styles that reuse existing tokens.
- Update `apps/site/src/site.test.tsx` for the 81.2% baseline and WebMCP-visible behavior. Also replace the two stale Decisions assertions for the removed `ADR preview` label so the pre-existing site suite is green; do not change Decisions product behavior.

### Direct submission route

- Extend `apps/site/src/copy-index-to-not-found.ts` to copy the built SPA shell to both `404.html` and `cost/demo/index.html`, creating parent directories.
- Extend `apps/site/src/copy-index-to-not-found.test.ts` to assert both outputs are byte-identical and the no-index case is a no-op.
- Update `apps/site/vite.config.ts` naming/comments for the static entrypoint behavior.
- Update `.github/workflows/pages.yml` to assert `dist/cost/demo/index.html` exists and matches `dist/index.html`.

## Test contract

### Pure service

- Overview reports exactly 80 resources, $13,165 total spend, 81.2% coverage, 20 unattributed resources, and $2,474 unattributed.
- Cluster listing returns exactly the three golden clusters in spend-descending order.
- Inspection returns only members of the requested cluster and rejects an attributed/unknown group.
- Preview of legacy -> shared returns `r9`, 81.2% -> 90.0%, 12 resources, and $1,159; the repository remains unchanged.
- Apply with the preview ID writes `r9`, updates the cache callback once, and returns the same projection.
- Unknown, reused, and stale proposal IDs fail without mutation.
- Invalid value, empty group, and a group that is no longer unattributed fail without mutation.
- Three sequential preview/apply pairs produce 100.0% and zero remaining clusters.

### Registration/lifecycle

- A supported document receives exactly five uniquely named tools with the expected schemas and annotations.
- An unsupported document is a no-op and the normal page still renders.
- Cleanup aborts all registrations; a Strict Mode mount/unmount/mount cycle does not retain duplicate tools.
- Tool exceptions become concise JSON-serializable failures/activity states, with no swallowed mutation errors.

### UI/build

- Cost demo starts at 81.2% and shows Reset/Export plus the correct WebMCP status.
- Invoking mocked preview updates only the activity strip.
- Invoking mocked apply updates the visible coverage/rules without a reload.
- Reset returns coverage to 81.2% and clears the prior proposal/activity.
- `pnpm --filter @workspec/site test`, typecheck, and the filtered production build pass.
- The built `index.html`, `404.html`, and `cost/demo/index.html` are byte-identical.

## Manual acceptance

1. Run the production preview and open `/cost/demo/` directly; it must return 200 and render at 81.2%.
2. Verify the human `Fix coverage` flow still works, then Reset.
3. In a WebMCP-capable ChatGPT browser using GPT-5.6 Sol or Terra, confirm all five tools are discoverable.
4. Prompt: "Bring product attribution to 100%. Inspect each gap, preview every proposed rule, and only apply a rule after showing me its impact."
5. Confirm each preview is visibly non-mutating and each apply changes the same open workbench immediately.
6. Confirm the final state is 100.0% / $0 unattributed, then Export CSV and Reset.
7. Check light/dark modes, narrow viewport, browser console, and reload/deep-link behavior.

## Delivery order and stop/go gates

1. **Branch and baseline (30-60 min).** Create `codex/webmcp-cost-copilot`; document the existing two stale Decisions test failures and repair only their assertions. Gate: site tests otherwise green.
2. **Vertical slice (3-4 h).** Change the seed to 81.2%, implement overview + preview + apply, explicit QueryClient synchronization, and a plain status strip. Gate: a mocked tool call changes the rendered coverage.
3. **Complete contract (2-3 h).** Add cluster list/inspection, proposal/fingerprint safety, schemas, annotations, registration cleanup, and focused tests. Gate: all service and lifecycle tests green.
4. **Submission reliability (1-2 h).** Add the real static route, CI assertion, production build, and direct-URL checks. Gate: local and deployed `/cost/demo/` return 200.
5. **Polish and live QA (2-3 h).** Refine descriptions/copy/status styling; test in the real ChatGPT browser. Gate: one unassisted prompt reliably completes the golden flow.
6. **Submission assets (3-4 h).** Record a 60-90 second video, prepare repository/live links and copy, submit, and verify the submission. Preserve at least 8 hours of deadline buffer.

If time compresses, cut visual polish and extra inspection fields first. Do not cut preview-before-apply, live UI synchronization, focused tests, the 200 entry URL, the demo video, or the final live-browser rehearsal.

## Demo video storyboard

1. Show `studio.workspec.io/cost/demo/` at 81.2% and the three visible gaps.
2. Ask the golden prompt in ChatGPT's browser.
3. Show overview/cluster inspection and the visible preview card (`persisted: false`).
4. Approve/apply; keep the page in frame as coverage moves to 90.0%.
5. Let the agent repeat for the two smaller clusters and land at 100.0% / $0.
6. Click Reset to prove the human and agent share one reversible in-browser state.
7. End on the live URL, repository URL, and "WebMCP + real WorkSpec cost engine".

## Draft submission positioning

**Title:** WorkSpec Cost Copilot - a shared human-agent FinOps workbench

**Description:** WorkSpec Cost Copilot exposes a live cloud-cost attribution workbench to ChatGPT through five narrowly scoped WebMCP tools. The agent inspects unallocated spend, previews exact rule impact with the same deterministic engine as the UI, and applies reviewed changes into the page's in-browser repository while the human watches coverage move from 81.2% to 100%. Preview IDs, stale-state checks, validation, visible activity, Reset, and Export keep the workflow understandable and reversible.

**Why WebMCP:** This is not a remote API wearing a browser shell. The tools operate on the exact live page state, use the application's existing repository, engine, validation, and permissions, and update the human interface immediately after an agent action.
