# @workspec/trace-ui

Host-agnostic React views for the WorkSpec Traceability Workbench: the persistent **meters bar**
(Scenario coverage · UserReq coverage · Pass rate, spec §5), the **Requirements explorer**
(filterable rows → click for the chain), and **Feature detail** (feature → userReqs → Rules →
scenarios, with the empty-rule/no-sysreq cases explicit) — composed by `TraceApp` and themed via a
`theme` prop. No host framework or CSS assumptions baked in (standalone lib + module-federation
remote, mirroring `@workspec/cost-ui`'s shape).

## Status: T5 (#73) — Requirements + Feature detail

Matrix and Run review land in T6/T7 (see [`docs/traceability/spec.md`](../../docs/traceability/spec.md)
§7/§8); `TraceApp`'s nav already reserves their tabs (rendered disabled).

This package renders an already-derived `TraceModel` from `@workspec/trace-model` — it never
re-derives coverage, rollups, or findings itself.

## Design adaptations from `docs/design/Traceability Workbench.dc.html`

The design doc is authoritative for layout/density/interaction; a few adaptations were necessary
because the validated `TraceModel` (the 5-kind Rule model) doesn't carry everything the mock shows:

- **Three meters, not two.** The mock shows Coverage + Pass rate; the spec is explicit that the
  validated model adds a third, `userReqCoverage` ("are the promises verified?", not just "are the
  scenarios run?"). `MetersBar` renders all three, keeping the mock's visual language.
- **Scenario identity is the scenario's own slug, not a composite key.** The mock's `fq()` helper
  built `<sysreq-slug>/<scenario-id>` keys (the earlier "file IS the scenario" draft). The validated
  model made `Scenario` its own fifth kind, keyed on its own slug alone (spec §4.5/§4.6) — every
  scenario reference in this package (`ScenarioNode.slug`, evidence, chain rows) uses that slug
  directly.
- **No Gherkin Given/When/Then text, no "As X, I want Y, so that Z" narrative.** `ScenarioNode` and
  `UserReqNode` don't carry those fields (they live on the raw artifacts, which this package never
  reads — it renders the derived model only). Scenario rows show title/slug/proof/evidence instead;
  userReq rows show title/slug/actor-slug/status.
- **Actors and features render by slug, not resolved display name**, where the model doesn't carry
  one — `UserReqNode.actor` is the bare actor slug (no `Actor` lookup exists on `TraceModel`); there
  is no per-feature `product` field on `FeatureNode`, so feature chips carry no product color.
- **"SysReq" is labelled "Rule"** — the validated model's own vocabulary (spec §4.4: a
  system-requirement IS a Gherkin Rule).
- **Per-feature coverage/pass figures in `FeatureDetail`** are a local view-layer aggregation over
  the scenarios reachable from that feature's Rules — not a fourth model meter. The three repo-level
  meters (`MetersBar`) stay the only numbers this package calls "the" coverage/pass rate.

## Scripts

| Script                                       | Does                                                                                                                  |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @workspec/trace-ui typecheck` | `tsc -b` (project references to trace-model + req-schema)                                                             |
| `pnpm --filter @workspec/trace-ui build`     | tsc (declarations) + tsup (ESM) + Tailwind → `dist/`                                                                  |
| `pnpm --filter @workspec/trace-ui build:mf`  | module-federation remote (`traceStudio`) → `dist-mf/`                                                                 |
| `pnpm --filter @workspec/trace-ui test`      | vitest (jsdom + testing-library)                                                                                      |
| `pnpm --filter @workspec/trace-ui lint`      | eslint                                                                                                                |
| `pnpm --filter @workspec/trace-ui dev`       | serves `dev/` — a standalone story over a seeded fixture model, for design-review screenshots (http://localhost:5183) |

## Host contract

`TraceStudioHost { repository, links?, navigate?, capabilities }` — mirrors every other Studio
module's shape. `repository: TraceRepositoryPort` has one method, `readModel(): Promise<TraceModel>`
— this package renders an already-derived model, so the port's only job is "hand me the current
one." A real host wires `readModel` to a call that loads the `.workspec/` tree + runs and pipes them
through `@workspec/trace-model`'s `buildModel`; `createMemoryRepository({ model })` is the in-memory
double tests, the dev story, and simple embedders use.

## Module-federation

`traceStudio` exposes `./MetersBar`, `./RequirementsExplorer`, `./FeatureDetail`, `./TraceApp`,
`./provider` (host contract + `TraceStudioProvider`), and `./reactProbe` (the single-React-instance
canary). `react`/`react-dom`/`react/jsx-runtime`/`@tanstack/react-query` are shared singletons;
`@workspec/trace-model`, `@workspec/req-schema`, and `@workspec/design` are bundled in.
