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
- **`/cost`** — the Cost Attribution module page: positioning copy plus a live `CostApp` demo
  (`/cost/demo`) running entirely in the browser against a `MemoryRepository` seeded with the
  worked `fieldstate-azure` estate (`src/cost-seed.ts` — a verbatim copy of
  `examples/fieldstate-azure-costs/`, the same 80-resource estate extended to 100% coverage).
  Fully editable (`editAttribution: true`) — toggle rules, promote a cluster via Fix coverage,
  reorder the rail, **Export CSV** — nothing leaves the page. `npx @workspec/cost-studio
stocktake` gives you the same workbench over your own subscription.

## Why it depends on the registry, not the workspace

Unlike the other workspace packages, this app depends on the **published**
`@workspec/decision-*` versions from npm (see `package.json` — concrete versions, not
`workspace:*`). The root `.npmrc` sets `link-workspace-packages=false`, so pnpm
installs them from the registry and the lockfile records the registry tarballs.

That makes the site a **living integration test of the published artifacts**: if
`pnpm --filter @workspec/site build` succeeds, the packages work for a stranger
running `npm install`. The vendored `src/examples/*.yaml` are a verbatim copy of
the repo's `examples/`, and validate against the published schema's `apiVersion`.

The four `@workspec/c4-*` packages are, for now, a **documented `workspace:*` devDependency
exception** (see `package.json`'s own `_LOUD_NOTICE_devDependencies_c4_packages` and
`docs/c4/drift-log.md` entry 20): the S4 canvas recomposition (#120) rebuilt `c4-ui` on the
not-yet-published `@workspec/canvas` (the C4 layer that was briefly `@workspec/canvas-c4` is now
folded into `c4-ui` itself — ADR i), so a registry pin can't show the
real `/c4/demo` until the family publishes at `0.1.0-alpha.6`. They flip back to registry pins in
`dependencies` at that publish — the same retire-the-exception step the c4 family already did once
at v0.1.0-alpha.2 (entry 17) and the cost family did at v0.1.0-alpha.5
(`docs/cost/drift-log.md` entry 1; both are registry pins today).

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
`/decisions/demo`, `/c4`, and `/cost` resolve.

The `studio.workspec.io` domain is Brett-gated — DNS + the Pages claim/cert sequence
still need a human to run them; see
[`docs/decisions/site-cutover-runbook.md`](../../docs/decisions/site-cutover-runbook.md).

Schema hosting has moved to `FieldstateNZ/workspec-schemas`, so this repo's single
Pages slot now serves the site only.
