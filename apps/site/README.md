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
- **`/c4`** — a coming-soon stub for the C4 Diagrams module: states what it will do and links
  the `packages/c4-*` packages. No product UI yet — swap it for the real module page once one
  exists, the way `/decisions` embeds `@workspec/decision-ui` today.

## Why it depends on the registry, not the workspace

Unlike the other workspace packages, this app depends on the **published**
`@workspec/*` versions from npm (see `package.json` — concrete versions, not
`workspace:*`). The root `.npmrc` sets `link-workspace-packages=false`, so pnpm
installs them from the registry and the lockfile records the registry tarballs.

That makes the site a **living integration test of the published artifacts**: if
`pnpm --filter @workspec/site build` succeeds, the packages work for a stranger
running `npm install`. The vendored `src/examples/*.yaml` are a verbatim copy of
the repo's `examples/`, and validate against the published schema's `apiVersion`.

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
