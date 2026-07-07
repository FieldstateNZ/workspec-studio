# Releasing

WorkSpec Decision Studio publishes four packages to npm, all versioned together:

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

## Notes

- **Chromium for the E2E** is pre-provisioned in the dev container. On a fresh CI runner install
  it with `pnpm --filter @workspec/decision-studio exec playwright install --with-deps chromium`
  (pinned to `@playwright/test` `1.56.1`). CI does this in the `standalone-e2e` job.
- **Schemas** publish separately to GitHub Pages via [`pages.yml`](./.github/workflows/pages.yml)
  so the `$schema` directive resolves — that is not part of the npm release.
- **Versioning:** keep the four packages on one version. The studio bin and the UI/engine/schema
  it bundles are only guaranteed to agree at matching versions.
