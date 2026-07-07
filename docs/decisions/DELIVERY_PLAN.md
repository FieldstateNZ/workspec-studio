# WorkSpec Decision Studio — Delivery Plan

**Owner:** Fieldstate Dev Lead · **Status:** Draft for sign-off · **Date:** 2026-07-04
**Branch:** `claude/fieldstate-delivery-plan-fslm6l`

> **Product framing (from the issues):** WorkSpec Decision Studio is an open-source,
> standalone, git-native tool for **costed architecture decisions as reviewable YAML
> artifacts**. It shares its artifact schema with WorkSpec Enterprise (open-core seam).
> Standalone has **no database, ever** — decisions are `*.decision.yaml` / `*.catalog.yaml`
> files in the working tree, versioned by git, which the app never touches directly.

---

## 1. Scope & source of truth

There are **8 issues (S0–S7)**, each a vertical ship-slice. The **issues are the scope
contract**; the attached design prototype (`Decision Studio.html` + imports) is the
**fidelity reference** for look and behaviour — we recreate its output, not its internals.

| #   | Slice                    | Package(s)                                           | Ships                                                                                                 |
| --- | ------------------------ | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 1   | **S0** Bootstrap         | root                                                 | pnpm monorepo, TS strict, ESLint/Prettier, Vitest, CI, Apache-2.0, README stub                        |
| 2   | **S1** Schema            | `@workspec/decision-schema`                          | Zod → TS types + runtime validation + JSON Schema (IntelliSense); fixtures                            |
| 3   | **S2** Engine            | `@workspec/decision-engine`                          | Pure cost engine w/ **normative** contract; golden snapshot; property tests                           |
| 4   | **S3** Repo + CLI        | `@workspec/decision-schema`(port), `studio`          | `DecisionRepositoryPort` (6 methods), `FsRepository`, `MemoryRepository`, CLI `validate`/`render-adr` |
| 5   | **S4** UI + host         | `@workspec/decision-ui`, `@workspec/decision-studio` | `DecisionStudioProvider`, Workspace view, cost editor, `--ds-*` themes; Express host shell; `serve`   |
| 6   | **S5** Views             | `@workspec/decision-ui`                              | Compare, Catalog (gated edit), ADR (decide flow) — four-view parity                                   |
| 7   | **S6** Module federation | `@workspec/decision-ui`, `examples/mf-host`          | MF remote build (`DecisionWorkspace`/`DecisionCard`/`AdrView`), smoke host, host contract doc         |
| 8   | **S7** Launch polish     | all                                                  | npx packaging, E2E, README, `docs/` specs, 2nd example, Pages schema publish                          |

**Dependency direction (enforced by package boundaries):** `schema ← engine ← ui ← studio`.

---

## 2. Critical path — this is a _linear_ chain

Every issue `Depends on` the one before it:

```
S0 ──▶ S1 ──▶ S2 ──▶ S3 ──▶ S4 ──▶ S5 ──▶ S6 ──▶ S7
bootstrap schema engine repo/CLI  UI+host  views   MF     launch
```

**Consequence for orchestration:** the slices _cannot_ be built in parallel — S2's engine
needs S1's types; S4's UI needs S3's repository port; S6's MF build needs all S5 views to
exist. There is no fan-out across slices to exploit. Orchestration is **sequential per
slice, with parallelism _inside_ a slice** (e.g. within S2: engine impl ∥ golden fixture ∥
property tests ∥ README, all against a frozen interface). Each slice is a review gate.

The highest-leverage, hardest-to-reverse work is front-loaded: **S1 (schema) and S2 (engine)
are normative** — they define behaviour that a future Rust CLI and WorkSpec Enterprise must
match byte-for-byte. Get these wrong and every later slice inherits the error. They deserve
the most care and the earliest sign-off.

---

## 3. Porting decisions register (⚠ resolve before / during S1–S2)

The prototype is a browser demo; the issues ask for production packages. Several
translations are **implied but not spelled out**. Left unpinned they cause silent
divergence from the golden numbers. These are the dev-lead's key calls:

| ID     | Decision                                                          | Prototype today                                                                                                                                                                                              | Target (proposed)                                                                                                                                                                                                                                                 | Slice |
| ------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| **P1** | **Levers become declarative data.**                               | `lever.match = (l)=>…`, `apply=(l)=>{…}` are **JS functions**.                                                                                                                                               | YAML can't hold functions. Levers become declarative `patch` ops: `match` on `tags/groups/ids/envs`, `set` `mode/schedule/qtyScale`, `add` lines (per issue #2/#3). Engine ships a patch **interpreter**.                                                         | S1→S2 |
| **P2** | **`compute(option)` → `compute(decision, catalog)`.**             | `compute` reads module-global `SKUS/MODES/SCHEDULES`.                                                                                                                                                        | Externalise pricing tables into a **catalog artifact**; engine takes catalog as an argument. Pure, no globals.                                                                                                                                                    | S2    |
| **P3** | **Catalog schema = the _simple_ engine model, not the rich one.** | Two models coexist: `engine.js` (`skus{price}`, `modes{mult,committed}`, `schedules{pct}`) **and** `catalog-data.js` (providers/resources/pricingModels/tiers/usage/custom). Only the first feeds `compute`. | OSS v1 `*.catalog.yaml` = the **engine model** (issue #2: `pricingModes(mult,committed)`, `schedules(pct)`, `skus(label,family,price)`). The rich provider/resource/tiered/usage/custom model is **out of OSS v1 scope** (Enterprise / future catalog).           | S1    |
| **P4** | **`recommend()` weights come from data.**                         | `fit = scaleCeiling·2 + opsBurden·0.5 + isolation·0.5 + migration·0.3 + lockIn·0.5 − (annual/maxAnnual)·3` (hardcoded).                                                                                      | Per-criterion weights move to `decision.criteria[].weight`; the **cost coefficient (`3`)** becomes a documented normative constant (or a decision-level field). Snapshot must reproduce the prototype's pick.                                                     | S2    |
| **P5** | **Headroom rule pinned.**                                         | `headroom` re-costs steady always-on prod compute at **`ri3` (0.50×)**; skips committed/part-scheduled lines.                                                                                                | Define normatively: "best committed mode available in the catalog for that line," or pin to a named mode. Snapshot-lock the hosting-platform numbers.                                                                                                             | S2    |
| **P6** | **`complete` semantics.**                                         | `option.complete !== false && monthly > 0`.                                                                                                                                                                  | Keep as engine output; schema carries optional `complete`/model-state so ACA ("Modelling") round-trips.                                                                                                                                                           | S1/S2 |
| **P7** | **Atlas / LLM generation is OUT.**                                | ADR view has an "Atlas" generate animation + `REASONS` map; `recommend` labelled "Atlas pick".                                                                                                               | Issue #6 scopes LLM/Atlas ADR authoring **out of OSS v1 (Enterprise-tier)**. Keep the **deterministic** `recommend()` math and a **deterministic** `render-adr`; drop the generation sequence and canned `REASONS`. The rationale is user-authored (decide flow). | S5    |
| **P8** | **Money formatting.**                                             | `money()` abbreviates (`$34k`); `moneyFull()` full.                                                                                                                                                          | `render-adr` (CI artifact) uses **full, stable** numbers for snapshot determinism; UI may abbreviate.                                                                                                                                                             | S3/S4 |
| **P9** | **Specs are to be authored.**                                     | `workspec-decision-schema-v0.1.md`, `tech spec v0.1` (§1 layout, D1–D6) are _referenced_ but don't exist.                                                                                                    | Author schema spec in S1, tech spec + D1–D6 decision records in S7 (dogfood the format as `*.decision.yaml`).                                                                                                                                                     | S1/S7 |

Any P-item that changes an on-disk number gets **re-snapshotted and called out** in that
slice's PR/commit so the golden artifact stays the single conformance source.

---

## 4. Per-slice delivery breakdown

Each slice below lists **objective → work items → verification (Definition of Done)**. DoD
maps 1:1 to the issue's acceptance criteria plus the house conventions the issues cite
(`fieldstate-fullstack`, `fieldstate-testing`: factories not shared fixtures, a11y basics).

### S0 — Bootstrap (issue #1)

- **Objective:** the skeleton every later slice builds on; dependency direction enforced by package boundaries.
- **Work:** pnpm workspace (`packages/{schema,engine,ui,studio}` + `examples/hosting-platform` stubs); `tsconfig.base.json` + project refs, TS strict; ESLint + Prettier (Fieldstate house style); Vitest at root; GH Actions CI (install → lint → typecheck → test on PR + main); Apache-2.0 LICENSE; README stub with positioning line.
- **DoD:** `pnpm install && pnpm -r build && pnpm -r test` green from clean clone; CI green; a reverse import (e.g. `schema` importing `engine`) fails to typecheck.

### S1 — `@workspec/decision-schema` (issue #2) ⟵ _normative_

- **Objective:** one Zod definition → TS types + runtime validation + JSON Schema (editor IntelliSense).
- **Work:** Zod for the full `v1alpha1` model (Decision, Option, Line as discriminated union on `flat`, Lever as **declarative patch** [P1], Catalog = engine model [P3]); `.describe()` on **every** field (hover docs); `zod-to-json-schema` script → committed `json-schema/` with CI drift check; YAML load helpers mapping Zod error paths → line/col (via `yaml` CST); fixtures = hosting-platform valid pair + battery of invalid files w/ expected error paths; `$schema` directive header; author `docs/workspec-decision-schema-v0.1.md` [P9]; document `*.decision.yaml`/`*.catalog.yaml` naming.
- **DoD:** valid fixtures parse, invalid fail with expected path + YAML line; JSON Schema drift-checked in CI; VS Code hover/completion verified & documented; six-way P-decisions reflected in types.

### S2 — `@workspec/decision-engine` (issue #3) ⟵ _normative_

- **Objective:** pure port of the prototype cost engine; identical output for identical input across any conforming impl.
- **Work:** `compute(decision, catalog)` [P2] (per-line/per-env monthly, per-env + annual totals, completeness [P6], headroom [P5]); normative rules (flat = `amount[env]`; SKU = `qty·price·mult·effectivePct`; `effectivePct = committed ? 1 : schedule.pct`; `annual = 12·Σ`); `applyLevers` declarative patch interpreter [P1] (ordered, `enabled:false` no-op); `validateRefs`; `recommend(results, criteria)` [P4]; golden snapshot of hosting-platform = cross-impl conformance artifact; fast-check property tests (committed ignores schedule; all-levers-off = base; per-lever idempotent); **zero runtime deps beyond `@workspec/decision-schema`**; README documents the contract as normative.
- **DoD:** golden snapshot matches prototype numbers for hosting-platform; property tests pass; dep audit clean; contract doc present.

### S3 — Repository port + FsRepository + CLI (issue #4)

- **Objective:** the storage abstraction that lets one UI run standalone (fs) and inside Enterprise (graph-backed); fs impl defines the standalone ceiling.
- **Work:** `DecisionRepositoryPort` — **exactly six methods** (`list/read/writeDecision`, `list/read/writeCatalog`), no watch/history/concurrency; `FsRepository` (discovers `**/*.decision.yaml`/`**/*.catalog.yaml`; Zod-validate on read+write; `$schema` header on write; preserve YAML comments via `yaml` Document API); `MemoryRepository` factory double; CLI (`packages/studio/bin.ts`): `validate [--dir]` (non-zero exit, `file:line` output), `render-adr [--out]` (deterministic markdown from YAML: context, options table w/ computed costs [P8], criteria, rationale; generated artifact, never committed — documented).
- **DoD:** temp-dir FsRepository unit/route tests (factories); `validate` catches every invalid fixture from S1 w/ correct `file:line`; `render-adr` on hosting-platform snapshot-stable and costs match S2 golden; port has exactly six methods.

### S4 — UI workspace + standalone host (issue #5)

- **Objective:** first runnable app; UI host-agnostic from day one.
- **Work (`packages/ui`, lib build only):** `DecisionStudioProvider` + `DecisionStudioHost` contract (`repository`, `links` resolver, optional `navigate`, `capabilities{editCatalog,decide}`); `DecisionWorkspace` view (option cards, per-env cost breakdown, lever toggles → engine recompute, cheapest + recommended badges, criteria + notes, links block per resolver); cost editor (line qty/mode/schedule, flat amounts, estimate flags); **`--ds-*` CSS variables only, no Tailwind across the package boundary** (MF constraint); console-dark + console-light themes ported; TanStack Query keyed on the port.
- **Work (`packages/studio`):** Express host (localhost, `--port`/`--dir`) → `FsRepository`, Zod-validated writes; client shell (file picker, theme toggle, mounts `DecisionWorkspace`); `serve` becomes default subcommand.
- **DoD:** `pnpm dev` in a hosting-platform dir → pick decision, costs match golden, toggle lever, costs update; UI component tests vs `MemoryRepository`; unresolved links render as inert labels w/o errors; dark/light work; a11y basics (focus, contrast, keyboard nav on lever toggles).

### S5 — Compare / Catalog / ADR views (issue #6)

- **Objective:** complete the four-view app to prototype parity.
- **Work:** **Compare** (side-by-side per-env + annual, criteria matrix, delta vs cheapest/recommended); **Catalog** (browse/edit providers/SKUs/pricing/schedules, gated on `capabilities.editCatalog`; edits write through the port as catalog artifacts); **ADR** (rendered preview via the **same deterministic renderer as S3 `render-adr`** — one renderer, two consumers; "Decide" gated on `capabilities.decide`: pick winner, capture "we accept X for Y" rationale, `status: decided`, stamp `outcome`, write through port); status lifecycle exploring → decided; superseded read-only w/ pointer. **Out:** Atlas/LLM authoring [P7].
- **DoD:** all four views navigable; catalog edit → costs recompute across referencing options; decide round-trips (YAML gains outcome+status, reopen shows decided, `render-adr` includes rationale); capability flags actually gate; per-view component tests vs `MemoryRepository`.

### S6 — Module federation remote + smoke host (issue #7)

- **Objective:** the same UI package consumable as an MF remote so Enterprise mounts Decision Studio in its shell — **no component forks**.
- **Work:** second build target on `packages/ui` via `@module-federation/vite`, exposing `./DecisionWorkspace`, `./DecisionCard` (compact: title, status, chosen option, annual cost), `./AdrView` (read-only); `react`/`react-dom` singletons (document version-range policy); styles self-contained (`--ds-*` from host w/ fallbacks; no Tailwind/global-CSS dependence); `examples/mf-host/` minimal Vite host consuming the remote w/ `MemoryRepository` (CI smoke test); host-contract doc in `packages/ui` README (`DecisionStudioHost`, LinkResolver semantics, theming vars).
- **DoD:** CI builds remote + smoke host, Playwright asserts `DecisionCard` renders correct cost data; lib + MF builds from one source, no forks; shared-dep config catches React duplication (single-instance assertion); host contract documented.

### S7 — Launch polish (issue #8)

- **Objective:** the "one command in a README" distribution story.
- **Work:** npm publish setup for all four `@workspec/*` packages (provenance, `files` allowlists, `exports` maps, studio `bin` for npx); one full Playwright E2E (open example → toggle lever → cost changes → decide → ADR renders → YAML on disk verified); root README (positioning, 60s quickstart, workspace screenshot/GIF, open-core note, schema/IntelliSense setup, CI `validate` snippet); `docs/` schema spec v0.1 + tech spec v0.1 + **D1–D6 as `*.decision.yaml`** (dogfood) [P9]; second worked example (e.g. "Postgres: managed vs self-hosted on k8s"); GitHub Pages publish of `json-schema/` for `schema.workspec.io` (CNAME documented; raw GitHub URL interim). **Out:** SchemaStore submission (deferred until v1).
- **DoD:** `npx @workspec/decision-studio` works clean-machine against examples; E2E green in CI; `$schema` URL resolves publicly; README quickstart verified by someone who didn't write it.

---

## 5. Orchestration model

**One branch, sequential slices, review gate between each.** Because the chain is linear
(§2), the dev lead drives it slice-by-slice:

1. **Freeze the interface** for the slice (types/contract) — this is the parallelism seam.
2. **Delegate the slice** to an implementation agent with: the issue text, the relevant
   prototype files, the applicable P-decisions, and the DoD. Inside a slice, fan out
   independent work (impl ∥ tests ∥ fixtures ∥ docs) against the frozen interface.
3. **Review gate:** dev lead verifies DoD, runs the slice's checks (build/lint/typecheck/test,
   and for S2+ the golden snapshot), reads the diff for the normative rules.
4. **Commit** to `claude/fieldstate-delivery-plan-fslm6l` with a message referencing the issue
   (`Closes #N`). Update the issue checklist.
5. Advance to the next slice only when the gate passes.

**Verification discipline:** S2 onward, the **golden snapshot is the contract** — any change
to on-disk numbers is deliberate, re-snapshotted, and noted. CI (from S0) must stay green on
the branch throughout; a red gate blocks advancement.

**Why not a parallel workflow / fan-out?** The dependency graph forbids it — there's no set
of slices that can run concurrently. The value is in careful sequencing and the review gate,
not fan-out.

---

## 6. Risks & mitigations

| Risk                                                             | Impact                                              | Mitigation                                                                                                                          |
| ---------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Normative divergence (S1/S2 numbers drift from prototype)        | Every later slice inherits wrong costs              | Golden snapshot locked in S2; P1–P8 resolved up front; earliest review focus                                                        |
| Lever functions → declarative patches loses expressiveness       | Some prototype levers can't be expressed            | Design the patch grammar against **all 5** prototype levers before coding [P1]                                                      |
| Two catalog models confuse scope                                 | Over-building the rich provider/resource model      | P3: OSS v1 = simple engine catalog; rich model explicitly deferred                                                                  |
| Tailwind leaks across the UI package boundary                    | S6 MF mount breaks on hosts w/o Tailwind            | Enforce `--ds-*`-only from S4; S6 smoke host proves no host CSS dependency                                                          |
| MCP servers (`Coffers`, `Workspec_Enterprise_Staging`) need auth | Enterprise-mount validation can't be exercised here | Not on the OSS critical path; smoke host (S6) is the standalone integration proof. Flag to user if Enterprise validation is wanted. |

---

## 7. Recommended sequencing

- **Milestone A — Normative core:** S0 → S1 → S2. The foundation + the two normative
  packages. Highest care, earliest sign-off. Nothing downstream is trustworthy until the
  golden snapshot is locked.
- **Milestone B — Runnable tool:** S3 → S4 → S5. Repository/CLI, first app, four-view parity.
  This is a usable standalone product.
- **Milestone C — Distribution:** S6 → S7. Enterprise mount seam + launch packaging.

Each milestone is a natural check-in point.
