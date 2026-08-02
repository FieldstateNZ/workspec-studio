# WorkSpec Studio

The open-source **WorkSpec workbench family** — one monorepo holding every free WorkSpec
product, publishing packages that WorkSpec Enterprise consumes directly rather than
duplicating. Every package here is Enterprise-grade by constitution: Enterprise is a future
consumer of this code.

| Module           | Status      | Where                                                                                                   |
| ---------------- | ----------- | ------------------------------------------------------------------------------------------------------- |
| Decisions        | live        | `packages/decision-*`, `apps/site`, `apps/mf-host`                                                      |
| C4 Diagrams      | in progress | `packages/c4-*`, `apps/site` (`/c4` demo), `docs/c4/`                                                   |
| Cost Attribution | in progress | `packages/cost-*`, `apps/site` (`/cost` demo), `docs/cost/` — publishes with the next tag               |
| Aspire Hosting   | in progress | `aspire-hosting/` (.NET), `docs/aspire-hosting/` — NuGet packaging/release wiring done, publish pending |

## Layout

```
packages/        published @workspec/* libraries
apps/            the Studio site and smoke hosts
aspire-hosting/  .NET Aspire hosting integrations (own solution — not a pnpm workspace member)
examples/        runnable example trees and demos
docs/            specs and design bundles
```

## Development

```bash
pnpm install
pnpm run lint        # eslint over the workspace
pnpm run typecheck   # per-package tsc (pnpm -r recursion)
pnpm run test        # per-package vitest (pnpm -r recursion)
pnpm run build       # per-package builds (--if-present)
pnpm run parity      # C4 visual-parity goldens (LOCAL-ONLY, macOS — see below)
```

CI runs the first four stages in order on every push and pull request. `pnpm run parity` is a
deliberate **local-only lane**: it screenshots the recomposed C4 canvas against committed
`*-chromium-darwin.png` goldens, which only reproduce on macOS — CI's ubuntu runners never run
it (see [`apps/parity/README.md`](apps/parity/README.md)). Run it on a Mac before merging
changes to `packages/canvas`, `packages/canvas-c4`, or `packages/c4-ui` chrome.

## Decisions module

Costed architecture decisions as reviewable `*.decision.yaml` / `*.catalog.yaml` artifacts —
imported with full git history from
[`FieldstateNZ/workspec-decision-studio`](https://github.com/FieldstateNZ/workspec-decision-studio).

| Package                     | Path                       | Role                                                                      |
| --------------------------- | -------------------------- | ------------------------------------------------------------------------- |
| `@workspec/decision-schema` | `packages/decision-schema` | Zod source of truth → TS types, runtime validation, JSON Schema           |
| `@workspec/decision-engine` | `packages/decision-engine` | Pure, normative cost engine (no IO, no DOM)                               |
| `@workspec/decision-ui`     | `packages/decision-ui`     | Host-agnostic React views (standalone + module-federation remote)         |
| `@workspec/decision-studio` | `packages/decision-studio` | Standalone CLI + localhost host shell (`validate`, `render-adr`, `serve`) |

`apps/site` is the product site + in-browser demo (consumes the published npm packages).
`apps/mf-host` is the module-federation smoke host (CI integration proof, never published).
`examples/` holds the worked example decision/catalog trees. Docs — the schema spec, the tech
design, and the project's own dogfooded decision records (D1–D6) — live under
[`docs/decisions/`](docs/decisions).

Releases publish via [`release.yml`](.github/workflows/release.yml) on a version tag (npm
trusted publishing/OIDC with provenance) — see
[`docs/decisions/RELEASING.md`](docs/decisions/RELEASING.md).

## C4 Diagrams module

Browse, validate, and render C4 architecture trees — actors, systems, containers, components,
domains, features, and diagrams — straight from the `.workspec/` files already in your repo.
Full docs, the `.layout/` contract, and CLI usage live under [`docs/c4/`](docs/c4).

| Package               | Path                 | Role                                                                                                                            |
| --------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `@workspec/c4-schema` | `packages/c4-schema` | Zod source of truth → TS types, runtime validation, generated JSON Schema                                                       |
| `@workspec/c4-model`  | `packages/c4-model`  | Pure loader/resolver: `.workspec/` tree → one typed model, with diagnostics                                                     |
| `@workspec/c4-layout` | `packages/c4-layout` | Deterministic ELK-based auto-layout, with `.layout/` pinning + round-tripping                                                   |
| `@workspec/c4-ui`     | `packages/c4-ui`     | Host-agnostic React components (interactive canvas + deterministic SVG export)                                                  |
| `@workspec/c4-studio` | `packages/c4-studio` | Standalone CLI (`workspec-c4`) + localhost host shell (`validate`, `render`, `serve`)                                           |
| `@workspec/canvas`    | `packages/canvas`    | Generic infinite-canvas engine (store factory, tools, shape modules, chrome) — extracted from the enterprise canvas (epic #116) |
| `@workspec/canvas-c4` | `packages/canvas-c4` | C4 semantics as a layer on `@workspec/canvas` — projection, card chrome, `C4CanvasHost`; `c4-ui` composes both                  |

The five `@workspec/c4-*` packages are published to npm at `0.1.0-alpha.5`; the workspace sits at
`0.1.0-alpha.6` (the S4 canvas recomposition, #120) pending the next tag, which also
first-publishes `@workspec/canvas` + `@workspec/canvas-c4`. Until then `apps/site`'s `/c4` page
takes the c4 packages as `workspace:*` devDependencies as a documented, temporary exception —
they flip back to registry pins at that publish — see
[`docs/c4/drift-log.md`](docs/c4/drift-log.md) entry 20.

## Cost Attribution module

Stock-take a cloud estate, attribute its spend to dimensions you declare (product, team, cost
type, client — whatever your organisation actually reports on), see coverage and rollups, and
compute/apply the tagging diff that converges live tags on that result — straight from plain YAML
artifacts that live in your repo and version with git. Full docs, the engine contract, Azure setup,
and the launch runbook live under [`docs/cost/`](docs/cost).

| Package                         | Path                           | Role                                                                                                                                                              |
| ------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@workspec/cost-schema`         | `packages/cost-schema`         | Zod source of truth for the four artifact kinds (Inventory, Spend, Attribution, TagPlan) — TS types, runtime validation, generated JSON Schema, byte-stable YAML. |
| `@workspec/cost-provider`       | `packages/cost-provider`       | Pluggable cost-data provider contract — `CloudProviderPort`, vendor-neutral result types, an in-memory test double.                                               |
| `@workspec/cost-provider-azure` | `packages/cost-provider-azure` | Azure implementation of `CloudProviderPort` — Resource Graph inventory, Cost Management spend, ARM tag apply, drift verification.                                 |
| `@workspec/cost-engine`         | `packages/cost-engine`         | Pure, normative attribution engine (no IO, no DOM) — matching, resolution, effects, overrides, coverage, rollups.                                                 |
| `@workspec/cost-ui`             | `packages/cost-ui`             | Host-agnostic React views — the unified Attribution Workbench, Inventory, Reports, Plan review (standalone lib + MF remote).                                      |
| `@workspec/cost-studio`         | `packages/cost-studio`         | Standalone CLI (`workspec-cost`) + localhost host shell — `stocktake`, `validate`, `report`, `plan`, `apply`.                                                     |

All six `@workspec/cost-*` packages are published at `0.1.0-alpha.5` (workspace staged at
`0.1.0-alpha.6` for the next tag) — see [`docs/cost/launch-checklist.md`](docs/cost/launch-checklist.md) for the runbook.
`apps/site`'s `/cost` page takes `cost-schema`/`cost-engine`/`cost-ui` as `workspace:*`
devDependencies as a documented, temporary exception, the same shape the c4 exception used before
its own first publish — see [`docs/cost/drift-log.md`](docs/cost/drift-log.md).

## Aspire Hosting module

Wires the C4/Decisions/Cost `workspec-*` CLIs into a .NET Aspire apphost: dashboard resources,
health checks, dashboard commands, and (for C4) a graph-sync drift gate that keeps `.workspec/`
aligned with the apphost's own live resource graph — feeding this repo's architecture/cost/decision
artifacts from the real running topology instead of a hand-maintained tree. `aspire-hosting/` is
this monorepo's only .NET area: its own solution, build props, and CI stage, sitting alongside (not
inside) the pnpm/TypeScript workspace. Full docs live under
[`docs/aspire-hosting/`](docs/aspire-hosting).

| Package                             | Path                                      | Role                                                                                                                    |
| ----------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `Aspire.Hosting.Workspec.Core`      | `aspire-hosting/aspire-hosting-core`      | Shared graph-dump contract (`workspec-graph/v1`), CLI locator, health checks, CLI-runner/Markdown-formatting primitives |
| `Aspire.Hosting.Workspec.C4`        | `aspire-hosting/aspire-hosting-c4`        | `workspec-c4` studio resource, graph-sync drift gate, validate/render-diagram commands                                  |
| `Aspire.Hosting.Workspec.Decisions` | `aspire-hosting/aspire-hosting-decisions` | `workspec-decisions` studio resource, `WithDecision` linking, validate/render-adr commands                              |
| `Aspire.Hosting.Workspec.Cost`      | `aspire-hosting/aspire-hosting-cost`      | Stocktake/report/validate commands, publish-time Azure cost-estimate step                                               |

All four ship as NuGet packages (`Workspec.Aspire.Hosting.Core`/`.C4`/`.Decisions`/`.Cost` — the
`Aspire.` PackageId prefix is reserved on nuget.org, so assemblies keep the `Aspire.Hosting.Workspec.*`
name while PackageIds use the `Workspec.` prefix instead) at `0.1.0-alpha.0`. Release wiring
(`.github/workflows/release.yml`) is inert-but-ready pending a one-time manual nuget.org Trusted
Publishing setup — see [`docs/decisions/RELEASING.md`](docs/decisions/RELEASING.md).

## Architecture

This repo documents its own architecture as a `.workspec/` tree at the repo root, validated and
rendered by its own `@workspec/c4-studio` CLI — the same tool this monorepo publishes.

**System Context** — who and what WorkSpec Studio talks to:

![WorkSpec Studio system context diagram](docs/c4/studio-system-context.svg)

**Container** — every published package plus the two consuming apps, and the real workspace
dependency edges between them:

![WorkSpec Studio container diagram](docs/c4/studio-container.svg)

Both SVGs are **generated, committed artifacts** — regenerate them with `pnpm run render:c4`
(root script) any time `.workspec/` changes. Rendering is deterministic, which is what makes a
package test (`packages/c4-studio/src/dogfood.test.ts`, run by the ordinary `pnpm run test`) an
honest staleness gate: it re-renders both diagrams from the live tree and asserts byte-identical
output against these committed files, alongside asserting the tree itself validates with zero
diagnostics.

## License

[Apache-2.0](LICENSE)
