# Releasing

WorkSpec Studio publishes the `@workspec/decision-*` and `@workspec/c4-*` npm families, and (A6,
[#39](https://github.com/FieldstateNZ/workspec-studio/issues/39)) the
`Workspec.Aspire.Hosting.*` NuGet family, from one `release.yml` workflow triggered by a version
tag. Each family versions and publishes independently — the release workflow walks every
publishable package/project and skips any whose current version is already on its registry, so
tagging a release with only one family bumped publishes exactly that family. This doc covers npm
first (the Decision Studio/C4/Cost package sets), then NuGet (`## NuGet (.NET)` below).

## npm (`@workspec/*`)

The Decision Studio set:

| Package                     | npx / import                                                |
| --------------------------- | ----------------------------------------------------------- |
| `@workspec/decision-schema` | library                                                     |
| `@workspec/decision-engine` | library                                                     |
| `@workspec/decision-ui`     | library (+ `./styles.css`, MF remote)                       |
| `@workspec/decision-studio` | `npx @workspec/decision-studio` (bin: `workspec-decisions`) |

Each package sets `publishConfig: { access: "public", provenance: true }`, ships `dist` +
`README.md` + `LICENSE`, and exposes types + ESM from the tarball. `examples/*` are `private`
and never publish.

## Preflight (always)

```bash
pnpm install
pnpm typecheck && pnpm test && pnpm lint
pnpm -r build
pnpm --filter @workspec/decision-ui build:mf
pnpm --filter @workspec/decision-studio e2e        # needs Chromium (see below)

# Inspect exactly what each tarball will contain — no src, dist + README + LICENSE.
pnpm --filter @workspec/decision-schema pack --pack-destination /tmp
pnpm --filter @workspec/decision-engine pack --pack-destination /tmp
pnpm --filter @workspec/decision-ui     pack --pack-destination /tmp
pnpm --filter @workspec/decision-studio pack --pack-destination /tmp
tar tzf /tmp/workspec-decision-studio-*.tgz     # expect dist/bin.js, dist/client/**, README, LICENSE
```

> `pnpm pack` rewrites the `workspace:*` dependencies to the concrete version, so the studio
> tarball depends on the exact `@workspec/*` versions being published in the same release.

## Automated (recommended)

The [`release.yml`](./.github/workflows/release.yml) workflow publishes on a version tag with
npm provenance (`id-token: write` + `publishConfig.provenance`).

One-time setup: add an npm **automation token** with publish rights to the `@workspec` scope as
the repo secret `NPM_TOKEN`.

```bash
# bump all four packages to the same version, commit, tag, push
pnpm -r exec npm version 0.1.0-alpha.1 --no-git-tag-version   # or edit the four package.json files
git commit -am "release: v0.1.0-alpha.1"
git tag v0.1.0-alpha.1
git push origin main --tags
```

Pushing the tag runs the workflow: install → build → typecheck → test → `pnpm -r publish`.

## Manual path

If publishing from a workstation instead of CI:

```bash
npm login                        # an account with @workspec publish rights
pnpm -r build
# Provenance requires a supported CI with OIDC; from a laptop, publish without it:
pnpm -r publish --access public --no-git-checks
```

`pnpm -r publish` walks the workspace in dependency order and skips `private` packages, so the
four libs go out and the examples do not. Add `--dry-run` first to rehearse.

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

Once all three are done, the same `git tag v0.1.0-alpha.1 && git push --tags` flow above publishes
both families in one push. A package already at its current version on nuget.org is skipped
(`dotnet nuget push --skip-duplicate`), mirroring the npm job's own per-package skip logic.

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
- **Schemas** publish separately to GitHub Pages via [`pages.yml`](./.github/workflows/pages.yml)
  so the `$schema` directive resolves — that is not part of the npm release.
- **Versioning:** keep the four npm packages on one version. The studio bin and the UI/engine/schema
  it bundles are only guaranteed to agree at matching versions. The four NuGet packages version
  independently of npm (they start at `0.1.0-alpha.0`, mirroring npm's own alpha convention, but
  are a separate ecosystem/tag namespace — bump `aspire-hosting/Directory.Build.props`'s shared
  `Version` property, not the npm packages' `package.json`s).
