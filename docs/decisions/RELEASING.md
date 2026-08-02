# Releasing

WorkSpec Studio publishes its npm families — `@workspec/decision-*`, `@workspec/c4-*`,
`@workspec/cost-*`, the canvas pair (`@workspec/canvas` + `@workspec/canvas-c4`, S5
[#121](https://github.com/FieldstateNZ/workspec-studio/issues/121)), `@workspec/topology-*`, and
the shared `@workspec/schema-core` / `@workspec/mcp-core` — and (A6,
[#39](https://github.com/FieldstateNZ/workspec-studio/issues/39))
the `Workspec.Aspire.Hosting.*` NuGet family, from one `release.yml` workflow triggered by a
version tag. Each family versions and publishes independently — the workflow walks every
publishable package/project and **skips any whose current version is already on its registry**, so
tagging a release with only one family bumped publishes exactly that family. This doc covers npm
first, then NuGet (`## NuGet (.NET)` below).

## npm (`@workspec/*`)

The publishable packages, by family (plus the two shared packages every family builds on):

| Family     | Packages                                                                                                                               |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| shared     | `schema-core`, `mcp-core` (every `*-studio` deps on `mcp-core` since [#100](https://github.com/FieldstateNZ/workspec-studio/pull/100)) |
| `decision` | `decision-schema`, `decision-engine`, `decision-ui`, `decision-studio` (bin: `workspec-decisions`)                                     |
| canvas     | `canvas` (generic engine), `canvas-c4` (C4 layer — versions with `canvas`, sits between `c4-layout` and `c4-ui` in publish order)      |
| `c4`       | `c4-schema`, `c4-model`, `c4-layout`, `c4-ui`, `c4-studio` (bin: `workspec-c4`)                                                        |
| `cost`     | `cost-schema`, `cost-provider`, `cost-provider-azure`, `cost-engine`, `cost-ui`, `cost-studio` (bin: `workspec-cost`)                  |
| `topology` | `topology-schema`, `topology-model`, `topology-adapters`, `topology-recon`, `topology-cost`, `topology-ui`, `topology-studio`          |

> **Not yet bootstrapped (as of S5, #121):** `canvas`, `canvas-c4`, `mcp-core`, and all seven
> `topology-*` packages are in `release.yml`'s array but have never been published — each needs
> the one-time [first-publish bootstrap](#first-publish-of-a-new-package) + trusted-publisher
> registration BEFORE the next tag push, or the OIDC publish loop fails on them with E404.
> (`trace-*`, `req-schema`, and `mcp-host` are deliberately not in the array yet.)
>
> **Bootstrap and tag in one sitting:** the bootstrap tarballs for `canvas-c4` and
> `topology-ui`/`-cost`/`-studio` embed exact deps on `alpha.6` siblings that only reach the
> registry when the subsequent tag run publishes them — those names dangle uninstallable until
> the `v0.1.0-alpha.6` tag lands, so do not leave a gap between bootstrapping and tagging.

Each package sets `publishConfig: { access: "public", provenance: true }`, ships `dist` +
`README.md` + `LICENSE`, and exposes types + ESM from the tarball. `examples/*` and `apps/*` are
`private` and never publish. `@workspec/design` is published from its own repo, not here.

## Preflight (always)

```bash
pnpm install
pnpm typecheck && pnpm test && pnpm lint
pnpm -r build
pnpm --filter @workspec/decision-ui build:mf
pnpm --filter @workspec/decision-studio e2e        # needs Chromium (see below)

# Inspect exactly what a tarball will contain — no src, dist + README + LICENSE — and confirm
# `pnpm pack` rewrote the workspace deps to concrete versions (no `workspace:` specifiers).
pnpm --filter @workspec/cost-studio pack --pack-destination /tmp
tar tzf /tmp/workspec-cost-studio-*.tgz                       # expect dist/**, README, LICENSE
tar -xzO -f /tmp/workspec-cost-studio-*.tgz package/package.json | grep '@workspec/'   # ^0.1.0-…, not workspace:
```

> **Always rebuild before packing.** `dist/` is gitignored, so a stale local `dist/` will pack
> stale code. The first cost publish shipped a pre-build `dist/` and landed on npm missing current
> exports — run `pnpm -r build` immediately before any pack/publish. (CI does this automatically;
> a manual publish must not skip it.)

## Automated (recommended)

The [`release.yml`](../../.github/workflows/release.yml) workflow publishes on a version tag using
**npm trusted publishing (OIDC)** — there is **no `NPM_TOKEN` secret**. GitHub mints a short-lived
id-token (`id-token: write`) and npm exchanges it for publish rights; provenance is attached from
each package's `publishConfig.provenance: true` because the publish runs in that OIDC-authenticated
CI context.

**One-time setup (per package):** register a **trusted publisher** on npmjs.com for each package
(package page → Settings → Trusted Publisher → GitHub Actions), pointing at owner `FieldstateNZ`,
repo `workspec-studio`, workflow `release.yml`. **A trusted publisher can only be added to a
package that already exists** — see [First publish of a new package](#first-publish-of-a-new-package)
for how to bootstrap a brand-new package name.

```bash
# bump a family to a new version (edit the package.json files, or `npm version` per package),
# commit, tag, push. Version the whole family together (see Versioning below).
git commit -am "release: cost 0.1.0-alpha.1"
git tag v0.1.0-alpha.4          # tag name is just the trigger; the workflow publishes by package version
git push origin main --tags
```

Pushing the tag runs the workflow: install → build → typecheck → test → then, per publishable
package, `pnpm --filter <pkg> pack` → `npm publish <tarball> --access public --tag <channel>`.
`pnpm pack` rewrites `workspace:*`/`workspace:^` deps to the concrete version inside the tarball, so
sibling `@workspec/*` deps resolve to the exact versions published in the same release. A
prerelease (e.g. `0.1.0-alpha.1`) is routed to its prerelease dist-tag (`alpha`/`beta`/`rc`), never
to `latest`; a stable version goes to `latest`. Packages already at their current version on the
registry are skipped, so a re-run never collides.

## First publish of a new package

Trusted publishing (OIDC) **cannot create a package that does not yet exist** — there is no package
page on which to register the trusted publisher, so the first `npm publish` of a brand-new name
fails with `E404 … PUT … Not Found … or you do not have permission`. Bootstrap each new package
once with a token-authenticated manual publish, then register its trusted publisher so CI takes
over.

```bash
npm login                                  # or a granular token; account must have publish +
npm whoami                                 # new-package rights on the @workspec scope
pnpm install && pnpm -r build              # NEVER skip the build — dist/ is gitignored
out="$(mktemp -d)"
# Publish in dependency order (schema first, studio last) so the registry is never left
# referencing an unpublished dep. Example for the cost family:
for pkg in cost-schema cost-provider cost-engine cost-provider-azure cost-ui cost-studio; do
  pnpm --filter "@workspec/$pkg" pack --pack-destination "$out"
  npm publish "$out/workspec-$pkg-<version>.tgz" --access public --tag alpha --provenance=false
done
```

- `--provenance=false` — a local publish can't attach provenance (that needs the CI OIDC id-token),
  and each manifest's `provenance: true` would otherwise make npm try and fail. The bootstrap
  version won't carry provenance; the first CI release afterward will.
- `--tag alpha` — a prerelease must not go to `latest` (npm 11 rejects it without an explicit tag).
- After the packages exist, register the trusted publisher (above) for each, and all subsequent
  releases go through CI via OIDC with provenance.

## Manual path (existing packages)

For an ad-hoc publish of packages that already exist on the registry, from a workstation:

```bash
npm login                                  # an account with @workspec publish rights
pnpm install && pnpm -r build              # rebuild — dist/ is gitignored
# Provenance requires CI OIDC; from a laptop, publish the packed tarballs without it, in
# dependency order (same loop as the bootstrap above), each with `--provenance=false`.
```

Prefer the automated path — it rebuilds, attaches provenance, and skips already-published versions.

## NuGet (.NET) — PENDING one-time setup

`aspire-hosting/` ships four .NET packages — `Workspec.Aspire.Hosting.Core`/`.C4`/`.Decisions`/
`.Cost` (assemblies stay `Aspire.Hosting.Workspec.*`; see
[`aspire-hosting/README.md`](../../aspire-hosting/README.md)'s "NuGet publishing" section for why
the PackageId prefix differs from the assembly name — the `Aspire.` prefix is reserved on
nuget.org). The same [`release.yml`](../../.github/workflows/release.yml) workflow's
`nuget-publish` job packs and pushes them on the same version tag, via **NuGet.org Trusted
Publishing (OIDC)** — no long-lived `NUGET_API_KEY` secret, mirroring the npm job's own OIDC
stance above.

**This is wired but INERT until the one-time setup below is done** — the job is gated behind
`if: vars.NUGET_PUBLISH_ENABLED == 'true'`, so today, pushing a tag publishes only the npm
families; the NuGet job runs and exits as a no-op guard, touching nothing on nuget.org.

### One-time setup (PENDING — Brett to do on nuget.org)

1. **Create a Trusted Publishing policy on nuget.org** (an account/organization with publish
   rights over the `Workspec.Aspire.Hosting.*` family — log in → username menu → **Trusted
   Publishing** → add a policy):
   - **Repository Owner:** `FieldstateNZ`
   - **Repository:** `workspec-studio`
   - **Workflow File:** `release.yml` (file name only — not the `.github/workflows/` path)
   - **Environment:** leave empty (this workflow doesn't use a GitHub Actions `environment:`)
   - The policy starts in a 7-day "temporarily active" window until its first successful publish
     supplies GitHub's repo/owner IDs to nuget.org — see nuget.org's own
     [Trusted Publishing docs](https://learn.microsoft.com/nuget/nuget-org/trusted-publishing).
2. **Add the `NUGET_USER` repo secret** (Settings → Secrets and variables → Actions → Secrets) —
   the nuget.org profile/organization name the policy above was created under (not an email
   address; nuget.org recommends keeping even this non-sensitive value in a secret).
3. **Flip the `NUGET_PUBLISH_ENABLED` repo variable to `'true'`** (Settings → Secrets and
   variables → Actions → Variables) — this is the switch that turns the inert `nuget-publish` job
   live. Until this step, leave it unset/`false`.

Once all three are done, the same `git tag … && git push --tags` flow above publishes both
ecosystems in one push. A package already at its current version on nuget.org is skipped
(`dotnet nuget push --skip-duplicate`), mirroring the npm job's own per-package skip logic. Note the
same first-publish constraint may apply: if the Trusted Publishing policy's glob doesn't permit
creating a brand-new package ID on first push, do one manual `dotnet nuget push` (below) with an API
key to create it, after which the OIDC policy takes over.

### Manual path (NuGet)

```bash
cd aspire-hosting
dotnet pack --configuration Release --output /tmp/nupkg
dotnet nuget push /tmp/nupkg/*.nupkg \
  --api-key <your-nuget-api-key> \
  --source https://api.nuget.org/v3/index.json \
  --skip-duplicate
```

## Notes

- **Chromium for the E2E** is pre-provisioned in the dev container. On a fresh CI runner install
  it with `pnpm --filter @workspec/decision-studio exec playwright install --with-deps chromium`
  (pinned to `@playwright/test` `1.56.1`). CI does this in the `standalone-e2e` job.
- **Schemas** publish separately to GitHub Pages via [`pages.yml`](../../.github/workflows/pages.yml)
  (in the `workspec-schemas` repo) so the `$schema` directive resolves — not part of the npm release.
- **Versioning:** keep each npm family on one version — the studio bin and the UI/engine/schema it
  bundles are only guaranteed to agree at matching versions — but families version independently of
  one another (decision, c4, and cost need not share a number). The `latest` dist-tag is not moved
  for prereleases (they go to the `alpha`/`beta`/`rc` tag), so a bare `npm i @workspec/<pkg>` during
  the alpha resolves to whatever was first published as `latest` — consumers should pin or use
  `@alpha`. The four NuGet packages version independently of npm via
  `aspire-hosting/Directory.Build.props`'s shared `Version` property (a separate ecosystem/tag
  namespace), not the npm packages' `package.json`s.

```

```
