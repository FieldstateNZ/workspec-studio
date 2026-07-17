# WorkSpec Studio — Traceability Workbench Spec (v0)

**Status:** draft, grounded in the `Traceability Workbench.dc.html` design
handoff (authoritative for all surfaces; committed to
[`docs/design/`](../design/Traceability%20Workbench.dc.html)).
**Repo:** `FieldstateNZ/workspec-studio` · CLI namespace: `workspec-trace`
**Supersedes:** an earlier draft that specced traceability as a link-graph
lens. That was wrong. This module is the **test surface**.

---

## 1. What this module is

**Proving requirements are met.** Not "what links to what" — _"is this
requirement actually proven, and by what evidence?"_

The insight that makes it possible is already in WorkSpec's data model
(`lib/db/src/schema/projects.ts`):

> _"A Gherkin scenario **IS** a system-requirement in v4 — there is no
> separate `scenario` artifact type."_

The requirement doesn't _have_ a test. The requirement **is** a test.
There is therefore no mapping problem to invent and no spec-vs-suite
drift to reconcile: the artifact being traced and the artifact being
executed are the same file. v5's `proven-by` is the edge that carries
the evidence; the chain terminates in proof rather than in a build slice.

**Why it matters beyond tidiness:** a requirements traceability matrix —
every requirement, its tests, its evidence — is a _compliance artifact_
under IEC 62304, ISO 13485, and FDA software guidance. It is universally
produced by hand, in spreadsheets, badly, at audit time. Studio generates
it from artifacts that already exist, continuously, in CI. That is this
module's real weight.

## 2. The emitter — the load-bearing concept

An **emitter** is a named convention binding SysReq artifacts to a test
toolchain **in both directions**. The design ships two — `cucumber` and
`junit` — with named conventions surfaced in the UI:

| Convention                | Meaning                                              |
| ------------------------- | ---------------------------------------------------- |
| `feature-file-per-sysreq` | each SysReq emits one `.feature` file                |
| `req-tag-on-scenario`     | emitted scenarios carry the SysReq slug as a tag     |
| `outline-from-examples`   | a SysReq's examples table becomes a Scenario Outline |

This is why **both directions are required**, and why they aren't two
separate features:

- **Emit (greenfield):** SysReq → test files. The suite is generated from
  the requirements, so coverage is total by construction.
- **Ingest (brownfield):** an existing suite tags scenarios with SysReq
  slugs (`req-tag-on-scenario`); results return as Cucumber JSON / JUnit
  XML and map back by the _same_ convention.

One convention, two directions. A repo can be fully generated, fully
tagged, or mixed — the emitter doesn't care, because the tag is the
identity either way.

**The emitter is the module's provider seam**, and its conventions are
normative: a conformant emitter must round-trip (emit → run → ingest →
the same SysReqs are proven).

## 3. Evidence model

```
SysReq (Gherkin — IS the requirement)
  └── proven-by → Evidence { run, status, at, duration, failure? }
```

Statuses, per the design: **pass · fail · skip · unproven**.

- `unproven` is the important one and is **derived, never stored**: a
  SysReq with no evidence in the latest run. Same philosophy as
  Enterprise's `anchored` — computed from what's loaded; no column, no
  drift.
- **Coverage** = SysReqs with any evidence ÷ all SysReqs.
- **Pass rate** = passing ÷ SysReqs with evidence.

Two separate meters, deliberately: _100% pass rate over 40% coverage is
the lie every test dashboard tells._ The design puts both side by side in
a persistent meters bar — that's the honest move and it should never be
collapsed into one number.

Evidence is **ingested, never authored** — runs are facts.

## 4. Artifacts

The module needs SysReq/Gherkin artifacts in Studio — the Gherkin end of
the chain, **not** all of WorkSpec's discovery model. Much smaller than
open-sourcing personas/needs/user-requirements, and it's the only new
kind this module requires.

```
requirements/
  element-authoring/
    sysreq-44.yml        # Gherkin lives inside; the file IS the requirement
features/
  element-authoring.yml  # sysreq → feature is the containing edge
.runs/
  2026-07-09T….json      # ingested evidence (derived, not authored)
```

- `sysreq → feature` is the containing relationship the design's
  **Feature detail** view renders (`sysreqsOf(feature)`).
- Features with **no sysreqs** are a first-class finding — the design
  counts them explicitly (`sysreqsOf(f.slug).length === 0`). That's the
  inverse orphan: a feature nobody wrote a requirement for. Unbuilt or
  unjustified work, made visible.

## 5. Surfaces (design is authoritative)

Shell: `workspec-trace / traceability`, emitter chip in the topbar,
counts, then the **meters bar** (Coverage · Pass rate · summary) —
persistent across every view, because those two numbers are the module's
entire claim.

Four views:

1. **Requirements** (explorer) — filterable rows; click a row for its
   chain. The default surface.
2. **Matrix** — the requirements traceability matrix. The compliance
   artifact. Must be exportable (§6).
3. **Feature detail** — a feature with its sysreqs and their scenarios,
   including the no-sysreqs case handled explicitly.
4. **Run review** — a run's results, failures foregrounded.

Design tokens are already WorkSpec's (`--accent`, `--ink-*`,
`--type-scenario`…): consume `@workspec/design`, define nothing locally.
The colour-coded `--type-feature` / `--type-persona` / `--type-scenario`
vocabulary is shared with the rest of Studio — respect it.

Host contract per every Studio module: `repository`, `links` resolver,
`capabilities`, MF-exposed.

## 6. CLI (`workspec-trace`) — where this earns its keep

- `emit --emitter cucumber [--feature <slug>]` — SysReqs → test files.
  The design surfaces this exact shape (`emit --emitter {{ emitter }}
--feature {{ fslug }}`), so it's a first-class user-facing verb, not a
  hidden build step.
- `ingest <results> --emitter junit|cucumber` — results → evidence.
- `verify` — **the CI gate.** Fails on coverage or pass-rate regression;
  thresholds configurable. This is what turns "requirements are proven"
  into a build-breaking property rather than a dashboard nobody opens.
- `matrix --out matrix.{md,csv,html}` — the RTM as a generated artifact.
  For a regulated user this single command is the reason to adopt.
- `render` — deterministic SVG of a feature's proof state.

## 7. Packages

```
packages/req-schema      # SysReq/Gherkin + feature artifacts → registry v1alpha1
packages/trace-model     # evidence join, coverage/pass/unproven derivation, diagnostics (pure)
packages/trace-emitters  # cucumber | junit — emit + ingest, one convention set each
packages/trace-ui        # the four views (design-system-native, MF remote)
packages/trace-studio    # CLI + standalone host
```

`trace-emitters` is the seam: each emitter is a pair of pure functions
(`emit(sysreqs) → files`, `ingest(results) → evidence[]`) plus its
declared conventions. Adding a framework means adding an emitter and
nothing else.

**Conformance test: round-trip.** Emit a fixture SysReq set, feed the
mocked runner output back through ingest, assert the same SysReqs are
proven. An emitter that can't round-trip is broken by definition.

## 8. Build sequence

1. `req-schema` — SysReq/Gherkin + feature kinds, registry-published,
   conformance-checked against the Enterprise tree.
2. `trace-model` — evidence join + coverage/pass/unproven derivation,
   golden fixtures.
3. `trace-emitters` cucumber (emit + ingest) + round-trip conformance.
4. `workspec-trace emit` / `ingest` / `verify` — CI-usable.
   **Shippable value with zero frontend.**
5. `trace-ui` Requirements + Feature detail (per the design).
6. Matrix view + `matrix` export — the compliance payload.
7. Run review; junit emitter.
8. Studio shell `/traceability`, site module page, demo seeded with the
   worked example (`example ▸ fieldstate-workspec` in the design — the
   repo proving its own requirements).

## 9. Open items

1. **Where evidence lives** — `.runs/` gitignored (default) vs committed
   (proof history). Recommend configurable, default ignore, and document
   committing as the regulated-user pattern: a git-versioned proof
   history is exactly what an auditor wants and nobody else offers it.
2. **Multi-run history** — v0 shows the latest run; trend (coverage over
   time) is the obvious v0.1 and the meters bar implies it. Confirm out
   of scope for v0.
3. **The other five designs in the handoff bundle** — Attribution
   Workbench, WorkSpec Studio, WorkSpec Docs, Site Review, Density
   Review. _WorkSpec Docs overlaps the docs design brief written
   separately_ — reconcile before briefing design again.
4. **Cross-project manifest** — still open; now needed by topology, cost
   attribution, and this module. Cheapest to design now.
