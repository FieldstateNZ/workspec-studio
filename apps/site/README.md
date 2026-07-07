# @workspec/site

The **WorkSpec Studio** site — one product, one site, modules as paths — served from this
repo's GitHub Pages at `studio.workspec.io`. See
[`docs/decisions/site-cutover-runbook.md`](../../docs/decisions/site-cutover-runbook.md) for the
one-time domain cutover from the old `decision-studio.workspec.io`.

- **`/`** — the Studio landing page: the family pitch (one free workbench over the WorkSpec
  artifacts already living in your repo) and module cards routing into each module.
- **`/decisions`** — the Decision Studio module page: positioning, the `npx` quickstart, the
  schema / IntelliSense story, and the open-core model.
- **`/decisions/demo`** — the full studio (Options / Compare / Catalog / ADR) running entirely
  in the browser against a `MemoryRepository` seeded with both worked examples. Toggle levers,
  edit costs, decide, and **Export ADR** — nothing leaves the page.
- **`/c4`** — the C4 Diagrams module page: positioning copy plus a live `C4Explorer` demo
  running entirely in the browser against a `MemorySource` seeded with the representative
  example tree (`src/c4-seed.ts` — the same anonymized tree `packages/c4-schema`'s conformance
  suite exercises, never this repo's own dogfood `.workspec/` tree — see
  `docs/c4/drift-log.md` entry 17). Read-only (`editLayout: false`); `npx @workspec/c4-studio
  serve` gives you the same explorer with drag-to-pin over your own repo.

## Why it depends on the registry, not the workspace

Unlike the other workspace packages, this app depends on the **published**
`@workspec/decision-*` versions from npm (see `package.json` — concrete versions, not
`workspace:*`). The root `.npmrc` sets `link-workspace-packages=false`, so pnpm
installs them from the registry and the lockfile records the registry tarballs.

That makes the site a **living integration test of the published artifacts**: if
`pnpm --filter @workspec/site build` succeeds, the packages work for a stranger
running `npm install`. The vendored `src/examples/*.yaml` are a verbatim copy of
the repo's `examples/`, and validate against the published schema's `apiVersion`.

**Deliberate, temporary exception — the four `@workspec/c4-*` packages (plus
`@workspec/design`, transitively via `c4-ui`) are `workspace:*` devDependencies, not registry
pins.** They aren't published to npm yet (the same trusted-publisher registration gate
blocking `@workspec/decision-*` releases — see the root README), so a registry pin is
impossible today; leaving `/c4` a permanent stub instead felt worse than a documented,
one-line-reversible exception. See the loud notice in `package.json` and
`docs/c4/drift-log.md` entry 17 for the full rationale. **The decisions demo's registry pins
are untouched** — this exception is scoped exclusively to the c4 packages, and flips to a
normal registry pin (moved into `dependencies`) the moment they publish.

## Develop

```bash
pnpm --filter @workspec/site dev       # vite dev server
pnpm --filter @workspec/site build     # static build → apps/site/dist (+ 404.html SPA fallback)
pnpm --filter @workspec/site preview    # preview the production build
```

## Deployment

[`pages.yml`](../../.github/workflows/pages.yml) builds this app and deploys it to
GitHub Pages at **`https://studio.workspec.io`** on every push to `main`
that touches `apps/site/**` (and on manual `workflow_dispatch`). The custom domain
is claimed by [`public/CNAME`](./public/CNAME) (Vite copies it to `dist/CNAME`), and
`dist/404.html` is the SPA fallback so client-routed deep links like `/decisions`,
`/decisions/demo`, and `/c4` resolve.

The `studio.workspec.io` domain is Brett-gated — DNS + the Pages claim/cert sequence
still need a human to run them; see
[`docs/decisions/site-cutover-runbook.md`](../../docs/decisions/site-cutover-runbook.md).

Schema hosting has moved to `FieldstateNZ/workspec-schemas`, so this repo's single
Pages slot now serves the site only.
