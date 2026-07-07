# WorkSpec Decision Studio — Technical Design v0.1

**Status:** draft · **Schema version:** `v1alpha1` · **Companion:** [decision schema spec](./workspec-decision-schema-v0.1.md)

Decision Studio is an open-source, standalone, git-native tool for **costed architecture
decisions as reviewable YAML artifacts**. It shares its artifact schema with WorkSpec Enterprise
(the open-core seam). Standalone has **no database** — decisions are `*.decision.yaml` /
`*.catalog.yaml` files in the working tree, versioned by git, which the app never bypasses.

This document is the technical design: the package layout, the repository-port seam, the
normative engine contract, the module-federation / open-core model, and the project's own
architecture decisions (D1–D6) — several of which are **dogfooded** as decision artifacts under
[`docs/decisions/`](./decisions/).

---

## 1. Package layout

Four published packages plus a smoke host, with a strict one-way dependency direction enforced
by package boundaries:

```
@workspec/decision-schema   Zod source of truth → TS types + runtime validation + JSON Schema
        ▲
@workspec/decision-engine   Pure cost engine (compute / applyLevers / recommend / render-adr model)
        ▲
@workspec/decision-ui       Host-agnostic React views (standalone lib + module-federation remote)
        ▲
@workspec/decision-studio   CLI (validate / render-adr) + Express localhost host + FsRepository
```

> **schema ← engine ← ui ← studio.** A reverse import (e.g. `schema` importing `engine`) fails to
> typecheck. Every `@workspec/*` package resolves to its TypeScript source in-workspace (the
> `@workspec/source` export condition + Vitest aliases) and to built `dist` for external
> consumers, so tests run against source without a prior build while published tarballs ship only
> `dist` + `README` + `LICENSE`.

| Package           | Ships                                                                                                         | Runtime deps                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `decision-schema` | types, `safeParse`, YAML load w/ line/col, `zod-to-json-schema`, the repository **port** + `MemoryRepository` | `zod`, `zod-to-json-schema`, `yaml`                  |
| `decision-engine` | `compute`, `applyLevers`, `validateRefs`, `recommend`, `buildAdrModel` + `renderAdrMarkdown`                  | `@workspec/decision-schema` only                     |
| `decision-ui`     | `DecisionStudioProvider`, four views, `DecisionCard`, `DecisionApp`; `--ds-*` themes; `styles.css`            | peers: `react`, `react-dom`, `@tanstack/react-query` |
| `decision-studio` | `workspec-decisions` bin, Express host, `FsRepository`, browser `HttpRepository`, bundled client              | `express`, `yaml`, the three `@workspec` libs        |

---

## 2. The repository-port seam

Storage is abstracted behind a **six-method** port — the single seam between standalone and
enterprise:

```ts
interface DecisionRepositoryPort {
  listDecisions(): Promise<DecisionRef[]>;
  readDecision(ref: Ref): Promise<Decision>;
  writeDecision(ref: Ref, decision: Decision): Promise<void>;
  listCatalogs(): Promise<CatalogRef[]>;
  readCatalog(ref: Ref): Promise<Catalog>;
  writeCatalog(ref: Ref, catalog: Catalog): Promise<void>;
}
```

Deliberately no `watch`, `history`, or `concurrency` — git is the history and concurrency story
standalone. Three implementations share the one interface:

- **`FsRepository`** (studio) — discovers `**/*.decision.yaml` / `**/*.catalog.yaml` by a manual
  recursive walk (no glob dep), Zod-validates on read **and** write, preserves YAML comments (the
  `yaml` Document API), and stamps the `$schema` directive on write. Refs are repo-root-relative
  POSIX paths.
- **`HttpRepository`** (studio client) — the same six methods over the Express JSON API, so the
  browser UI is storage-agnostic: `client → HTTP → Express → FsRepository → working tree`.
- **`MemoryRepository`** (schema) — an in-memory factory double for UI/component tests and the MF
  smoke host.

The Express host validates every write against the schema **before** it reaches the repository,
so a malformed `PUT` is rejected with located issues and never written. Path traversal outside
the served directory is refused.

---

## 3. The normative engine contract

The engine is **pure** — no IO, no DOM, no globals — and its numbers are **normative**: any
conforming implementation (a future Rust CLI, WorkSpec Enterprise) must produce identical output
for identical input. The hosting-platform golden snapshot is the cross-implementation conformance
artifact; any change to on-disk numbers is deliberate and re-snapshotted.

**Per-line monthly cost, for an environment `env`:**

- **flat line:** `amount[env]`
- **SKU line:** `qty[env] × sku.price × mode.mult × effectivePct`, where
  `effectivePct = mode.committed ? 1 : schedule.pct`

**Roll-ups:** per-env totals sum active environments; `annual = 12 × monthly`. An option is
`complete` iff `option.complete !== false && monthly > 0` (porting decision P6).

**Levers** (`applyLevers`) are the declarative-patch interpreter (D3): ordered ops, each a
`match` + `set`/`addLines`, applied to a copy of the lines; `enabled: false` is a no-op. `set`
mutates SKU lines only.

**Headroom** (P5): the monthly saving from moving steady (`schedule.pct ≥ 0.95`), always-on,
non-committed **prod** compute to the catalog's cheapest committed mode. `max(0, Σ savings)`.

**Recommendation** (`recommend`, P4): over complete options only,
`fit = Σ(criterion.weight × score) − COST_COEFFICIENT × (annual / maxAnnual)`, with the normative
constant `COST_COEFFICIENT = 3`. Highest fit wins; ties resolve to decision option order.

**One renderer, two consumers:** `buildAdrModel(decision, catalog)` is a pure transform; the CLI's
`render-adr` serialises it to Markdown and the ADR view renders the same model, so the committed
`*.adr.md` and the on-screen record never diverge. There is no LLM/Atlas authoring (P7) — the
recommendation is deterministic math and the rationale is user-authored.

---

## 4. Module federation & the open-core model

`decision-ui` builds twice from **one source**: a standard library build (tsup → `dist`) and a
module-federation remote (`@module-federation/vite` → `dist-mf`) exposing `./DecisionWorkspace`,
`./DecisionCard`, and `./AdrView`. There are **no component forks** — the same views run
standalone and, mounted at runtime, inside WorkSpec Enterprise's shell (decision **D5**).

The contract that makes this work is `DecisionStudioHost`, the single object the UI depends on:

- `repository` — the six-method port (fs/http standalone; graph-backed in Enterprise);
- `links` — a `LinkResolver`. Standalone returns `{ resolved: false }` and links render as inert
  labels; Enterprise resolves them to real hrefs/navigation — **"links come alive in
  Enterprise"**;
- `navigate?` — host navigation for resolved targets and view switches;
- `capabilities` — `{ editCatalog, decide }` feature gates.

`react` / `react-dom` / `@tanstack/react-query` are shared singletons across the federation
boundary (a documented version-range policy); styles are self-contained via `--ds-*` CSS
variables with fallbacks — **no Tailwind or global CSS crosses the package boundary**. The
`examples/mf-host` smoke host is the CI integration proof: it mounts the remote over a
`MemoryRepository` and Playwright asserts `DecisionCard` renders the golden cost **and** that
there is exactly one React instance across the boundary.

---

## 5. Distribution

`npx @workspec/decision-studio` in a repo with a `*.decision.yaml` boots the localhost host over
the working tree; `workspec-decisions validate` / `render-adr` are the CI-friendly subcommands.
All four packages publish public with npm provenance (`publishConfig`), ship `dist` + README +
LICENSE, and expose types + ESM from the published tarball shape. The generated JSON Schemas are
published to GitHub Pages so the `$schema` directive resolves in editors (see the schema spec §2
and the root README for the canonical vs interim URL status).

---

## 6. Architecture decisions (D1–D6)

The project's own decisions. **Dogfooding note:** the costed decision format fits a decision when
every compared option carries a positive, graded cost/effort (so options are `complete` and the
recommendation runs). D1/D4/D5 fit that shape and are authored as **`*.decision.yaml`** under
`docs/decisions/` (effort-costed in loaded engineer-days, sharing `decisions.catalog.yaml`).
D2/D3/D6 are constraint- or scope-driven — their deciding factor isn't a graded cost, and D6's
winner literally costs ~$0 (which the engine marks "incomplete") — so they are **markdown ADRs**.
That split is itself a finding from dogfooding: the format is for _costed_ trade-offs, and it is
honest about where a decision isn't one.

| #      | Decision                           | Chosen                                   | Form            | Record                                                                                           |
| ------ | ---------------------------------- | ---------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------ |
| **D1** | Monorepo structure & build tooling | pnpm workspaces + tsup                   | `decision.yaml` | [`d1-monorepo-build-tooling.decision.yaml`](./decisions/d1-monorepo-build-tooling.decision.yaml) |
| **D2** | Schema single source of truth      | Zod → types + validation + JSON Schema   | markdown ADR    | [`d2-zod-single-source-of-truth.md`](./decisions/d2-zod-single-source-of-truth.md)               |
| **D3** | Lever representation               | Declarative patch ops (not code)         | markdown ADR    | [`d3-declarative-levers.md`](./decisions/d3-declarative-levers.md)                               |
| **D4** | Catalog model scope for v1         | Simple engine model; rich model deferred | `decision.yaml` | [`d4-catalog-model-scope.decision.yaml`](./decisions/d4-catalog-model-scope.decision.yaml)       |
| **D5** | Enterprise mount seam              | Module federation remote                 | `decision.yaml` | [`d5-enterprise-mount-seam.decision.yaml`](./decisions/d5-enterprise-mount-seam.decision.yaml)   |
| **D6** | Standalone storage                 | Filesystem only, no database             | markdown ADR    | [`d6-filesystem-only-standalone.md`](./decisions/d6-filesystem-only-standalone.md)               |

Each dogfooded record is `status: decided` with a recorded `spec.outcome`; run them yourself:

```bash
npx @workspec/decision-studio validate  --dir docs/decisions
npx @workspec/decision-studio render-adr --dir docs/decisions --decision dec-d5-enterprise-seam
```

Notably **D5's recommendation is not the cheapest option** — module federation ($28,800/yr
effort) beats the cheaper npm-embed ($14,400/yr) because the "runtime mount, no forks" criteria
outweigh the extra effort. That cheapest-≠-chosen shape is exactly what the tool exists to make
legible.

---

## 7. Porting decisions (P1–P9)

The prototype→production translations (declarative levers, `compute(decision, catalog)`, the
simple catalog model, data-driven weights, the pinned headroom rule, deterministic `render-adr`,
no LLM authoring, spec authoring) are catalogued in the delivery plan §3 and realised across
S1–S7. The normative ones (P1–P8) are locked by the hosting-platform golden snapshot; P9 (authoring these
specs and dogfooding the decision records) is this document and `docs/decisions/`.
