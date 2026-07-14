# Launch checklist

The human runbook for shipping the Cost Attribution module for real: tag-push publish, registry
verification, flipping `apps/site`'s workspace exception, the live dogfood, the `npx` acceptance
test, and the schema-hosting follow-up — in that order, as six numbered items below (this doc's
own [`README.md`](README.md) doc index and [`schema-spec.md`](schema-spec.md) both cross-reference
these item numbers, so don't renumber without updating both).

Nothing in this checklist runs automatically. Everything here is a step a human runs, in order,
once the code in this repo is ready — which, as of this module's C7 slice, it is.

## Preflight (always, before item 1)

```bash
pnpm install
pnpm run lint && pnpm run typecheck && pnpm run build && pnpm run test
pnpm --filter @workspec/cost-studio e2e   # needs Chromium — see "Notes" at the end

# Inspect exactly what each tarball will contain — no src, dist + README + LICENSE.
for pkg in cost-schema cost-provider cost-provider-azure cost-engine cost-ui cost-studio; do
  pnpm --filter "@workspec/$pkg" pack --pack-destination /tmp
done
tar tzf /tmp/workspec-cost-studio-*.tgz   # expect dist/bin.js, dist/client/**, README, LICENSE
```

> `pnpm pack` rewrites each package's `workspace:*` dependencies to the concrete version being
> published in the same release — the studio tarball ends up depending on the exact
> `@workspec/cost-*` versions this release ships, never `workspace:*`.

## 1. Tag-push publish

All six cost packages are at `0.1.0-alpha.0` today (`cost-schema`, `cost-provider`,
`cost-provider-azure`, `cost-engine`, `cost-ui`, `cost-studio`) and are already listed in
[`release.yml`](../../.github/workflows/release.yml)'s publish array, alongside the
`decision-*` and `c4-*` families. Publishing them is the same tag-push flow those families use —
there is no separate cost-specific release workflow.

```bash
# Bump every family that needs a new version. If the cost-* packages are already
# correctly versioned at 0.1.0-alpha.0 and have never been published, no version bump
# is needed — just cut the tag. If a version needs to change, bump each cost-* package.json
# (keep all six in lockstep, same convention decision-*/c4-* use) and commit that first.
git tag v0.1.0-alpha.0
git push origin main --tags
```

Pushing the tag runs `release.yml`: install → build → typecheck → test → pack each package
→ `npm publish` per package via OIDC trusted publishing (no `NPM_TOKEN` secret; provenance is
attached automatically). The workflow **skips any package whose current version is already on the
registry** — a re-run, or a tag that only bumps some families, never collides or double-publishes.

**Prerequisite, one-time**: a trusted publisher must be registered on npmjs.com for each of the
six `@workspec/cost-*` packages, pointing at owner `FieldstateNZ` / repo `workspec-studio` /
workflow `release.yml` — the same registration decision-*/c4-* already needed. Do this before
pushing the tag; a missing trusted-publisher registration fails that package's publish step (and
the workflow's "nothing to publish" guard will catch it if every package fails).

## 2. Registry verification

After the workflow finishes, confirm all six landed:

```bash
for pkg in cost-schema cost-provider cost-provider-azure cost-engine cost-ui cost-studio; do
  npm view "@workspec/$pkg@0.1.0-alpha.0" version dist.tarball
done
```

Each should print `0.1.0-alpha.0` and a tarball URL, not a 404. Also spot-check the CLI installs
and runs from the registry (this is the shape the final `npx` acceptance test in item 5 repeats
end-to-end):

```bash
npx --yes @workspec/cost-studio@0.1.0-alpha.0 --help
```

If any package 404s, re-check its trusted-publisher registration and re-run the workflow
(`workflow_dispatch` on `release.yml`, or push a new tag) — don't hand-publish around it; the
whole point of trusted publishing is that the OIDC-authenticated CI run is the only path that can
attach provenance.

## 3. Flipping `apps/site`'s workspace exception

This C7 slice added `@workspec/cost-schema`, `@workspec/cost-engine`, and `@workspec/cost-ui` to
`apps/site/package.json` as `workspace:*` **devDependencies** — a deliberate, temporary exception
to the site's registry-pins-only rule, documented in
[`drift-log.md`](drift-log.md) entry 1. It's the same exception `@workspec/c4-*` went through
(`docs/c4/drift-log.md` entry 17) between the c4 family's own C7-equivalent slice and its first
publish — mirror **exactly** how PR #27 resolved that entry when the c4 family published at
`0.1.0-alpha.2`:

1. In `apps/site/package.json`: move `@workspec/cost-schema`, `@workspec/cost-engine`, and
   `@workspec/cost-ui` out of `devDependencies` and into `dependencies`, pinned at the real
   published version (`0.1.0-alpha.0` per items 1–2 above, or whatever version actually shipped),
   the same shape `@workspec/decision-*` and (post-resolution) `@workspec/c4-*` already have.
   Delete the `_LOUD_NOTICE_devDependencies_cost_packages` block entirely.
2. Update the package's own `description` field: drop the "temporary workspace-devDependency
   exception" sentence, restoring the plain "Consumes the PUBLISHED @workspec/* packages from
   npm" framing every other family's presence already implies.
3. In `apps/site/tsconfig.json`: delete the `references` array pointing at
   `packages/cost-schema/tsconfig.build.json` / `packages/cost-engine/tsconfig.build.json` /
   `packages/cost-ui/tsconfig.build.json` — registry-pinned `@workspec/*` deps ship their own
   `.d.ts`, so no project reference is needed once they resolve from `node_modules` instead of a
   pnpm workspace symlink. Update the surrounding comment to say so (mirror the comment
   `tsconfig.json` carries today for the retired c4 exception).
4. In `apps/site/vite.config.ts`: no functional change is needed (the `workspace:*` protocol
   already resolved through each package's own `exports` map, same as a registry install would) —
   just update the comment that names the cost exception, the same no-op-but-documented edit c4's
   resolution made.
5. In `docs/cost/drift-log.md`, append a **"Resolved <date>"** line to entry 1, in the same voice
   and shape as `docs/c4/drift-log.md` entry 17's own "Resolved 2026-07-11" addendum: name the
   version the family published at, and state that `apps/site` now pins all three packages in
   `dependencies` with no exceptions remaining.
6. Run `pnpm install && pnpm run build && pnpm run typecheck && pnpm run test` from the repo root
   afterward — the site's own tests (in particular the `/cost` and `/cost/demo` render tests) must
   still pass unchanged; this flip changes dependency resolution, not behavior.

## 4. Live dogfood

Run the CLI for real against an actual Azure subscription — the step the worked example
(`examples/fieldstate-azure-costs/`) deliberately narrates rather than runs, because that example
has no live subscription behind it. This is also where the [`azure-setup.md`](azure-setup.md)
live-check items get confirmed against real Azure responses instead of training-knowledge best
guesses.

```bash
az login   # or set up a service principal — see azure-setup.md's auth chain

mkdir -p /tmp/cost-dogfood && cd /tmp/cost-dogfood
npx @workspec/cost-studio stocktake --subscription <a-real-subscription-id> --name dogfood
npx @workspec/cost-studio validate
npx @workspec/cost-studio report
```

While this runs:

1. **Confirm the Cost Management currency column name** (`Currency` / `BillingCurrencyCode` /
   `PricingCurrencyCode`) — check the written `dogfood.<period>.spend.yaml` for a real currency
   code (e.g. `USD`, `NZD`), not the `XXX` placeholder. If it's `XXX`, capture the raw Cost
   Management response body (with values redacted per below) and file a follow-up against
   `packages/cost-provider-azure/src/spend.ts`.
2. **Confirm the `timePeriod` format Cost Management actually expects** — if `fetchSpend`
   succeeded and the spend rows cover the expected billing period, the full-ISO-datetime form is
   confirmed; if Cost Management rejected the query or returned an empty/wrong period, that's the
   signal to revisit `monthRange` in `src/spend.ts`.
3. **Exercise a real `apply` failure path if you can arrange one** (e.g. temporarily revoke `Tag
   Contributor` on one test resource) to see what ARM's real per-entry error response looks like,
   and confirm whether `error: "HTTP {status}"` alone is enough operator signal or whether parsing
   the response body's `error.code`/`error.message` is worth a follow-up.
4. Run the manual live-check script too, which exercises the full port surface in one shot
   (`fetchInventory`, `fetchSpend`, `verifyBaseline`, and a `dryRun: true` `applyTags` — never a
   real tag mutation):

   ```bash
   WORKSPEC_COST_LIVE_CHECK=1 WORKSPEC_COST_LIVE_CHECK_SUBSCRIPTION=<sub-id> \
     pnpm --filter @workspec/cost-provider-azure live-check
   ```

**Redact before committing anything.** Whatever you keep from this run (a fixture, a screenshot, a
written artifact) must have real subscription ids, resource ids, resource group names, and tag
values replaced with placeholders — the same bar `examples/fieldstate-azure-costs/` already holds
(synthesized ids, no real tenant data). Never commit the raw `dogfood.*.yaml` files from a real
subscription as-is. If the dogfood run surfaces something worth keeping as a fixture or a doc
update, redact it first, then commit that.

## 5. `npx` acceptance test

The final proof that a stranger with nothing installed can actually use the published package —
repeat [`README.md`](README.md)'s own quickstart, but against the real registry instead of a
pre-publish "clone and build from source" workaround:

```bash
# From a clean shell/directory — no repo clone, no pnpm workspace in scope.
npx @workspec/cost-studio stocktake --subscription <sub-id>
npx @workspec/cost-studio report
```

This must complete without the `npx` command 404ing (item 2 already confirmed the tarball exists;
this confirms the bin actually runs standalone, with all its `workspace:*` deps correctly rewritten
to real versions inside the published tarball — see the preflight note above). Once this passes,
delete the "not yet published to npm" caveat and its `git clone` workaround from
[`README.md`](README.md)'s quickstart section 1 — the plain `npx` command becomes the only path
documented.

## 6. Schema-hosting follow-up

The four cost JSON Schemas (`json-schema/inventory.schema.json`, `spend.schema.json`,
`attribution.schema.json`, `tagplan.schema.json`, all at this repo's root) are **not** served from
this repo's own GitHub Pages deploy. Schema hosting for `schema.workspec.io` lives in a **separate
repository**, `FieldstateNZ/workspec-schemas` (confirmed via this repo's own
[`pages.yml`](../../.github/workflows/pages.yml) header comment and
[`apps/site/README.md`](../../apps/site/README.md)) — this repo's Pages workflow deploys
`apps/site` only. Getting the four cost schemas live at their `$schema` URLs
(`https://schema.workspec.io/v1alpha1/{inventory,spend,attribution,tagplan}.schema.json`, per
every artifact's own `# yaml-language-server: $schema=...` header) is a manual step this codebase
cannot automate:

1. Clone `FieldstateNZ/workspec-schemas` (a separate repo — not this one).
2. Copy the four files verbatim:
   ```bash
   cp json-schema/inventory.schema.json    <workspec-schemas-checkout>/v1alpha1/inventory.schema.json
   cp json-schema/spend.schema.json        <workspec-schemas-checkout>/v1alpha1/spend.schema.json
   cp json-schema/attribution.schema.json  <workspec-schemas-checkout>/v1alpha1/attribution.schema.json
   cp json-schema/tagplan.schema.json      <workspec-schemas-checkout>/v1alpha1/tagplan.schema.json
   ```
   (Match whatever path convention that repo's existing `decision.schema.json` /
   `catalog.schema.json` already use for the `v1alpha1` prefix — this codebase doesn't control that
   repo's layout, so confirm against what's already there rather than assuming the path above is
   exact.)
3. Commit and push in `workspec-schemas` (that repo's own PR/review process applies — this is a
   cross-repo hand-off, not something `workspec-studio` CI triggers).
4. Verify: `curl -sI https://schema.workspec.io/v1alpha1/attribution.schema.json` returns `200`,
   and its body matches `json-schema/attribution.schema.json` in this repo byte-for-byte (repeat
   for the other three).
5. Every artifact this module writes already carries the right `$schema` header pointing at these
   URLs (see `schema-spec.md` §1) — no code in this repo needs to change once the schemas are live
   at that host; this item is purely the cross-repo publish step.

This item is independent of items 1–5 and has no ordering dependency on them — it can happen
before or after the npm publish, whenever a human with access to `workspec-schemas` does it.

## Notes

- **Chromium for the e2e** — `pnpm --filter @workspec/cost-studio e2e` needs a Chromium binary.
  Locally, whatever `PLAYWRIGHT_BROWSERS_PATH` already resolves; on a fresh machine/runner:
  `pnpm --filter @workspec/cost-studio exec playwright install --with-deps chromium` (pinned to
  `@playwright/test` 1.56.1, matching `@workspec/decision-studio`'s pin). This e2e suite is **not**
  wired into `.github/workflows/ci.yml` — mirroring the decision of `@workspec/decision-studio`'s
  own e2e suite, which also runs only on request, never automatically in CI.
- **Versioning**: keep all six cost packages on one version, the same convention the
  decision-*/c4-* families use — `cost-studio`'s bin and the engine/schema/ui it bundles are only
  guaranteed to agree at matching versions.
- **`examples/fieldstate-azure-costs/`** never needs a live subscription and is not part of this
  checklist — it's a standing, committed worked example (see its own README), independent of
  whether the module has published yet.
