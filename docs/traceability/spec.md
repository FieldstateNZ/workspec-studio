# WorkSpec Studio — Traceability Workbench Spec (v0)

**Status:** validated. Contains the full artifact model inline (§4) — the part frozen by
`req-schema` (T1).
**Repo:** `FieldstateNZ/workspec-studio` · CLI: `workspec-trace`
**Design:** [`docs/design/Traceability Workbench.dc.html`](../design/Traceability%20Workbench.dc.html)
(authoritative for surfaces).
**Scope decision:** **Option B confirmed** — WorkSpec is open-source; anything living in the repo
is open. All artifact kinds are file-native. Enterprise's moat is the resolved linkage graph +
teams/seats, not the artifact model.

**Two corrections folded in from review:**

1. **The file IS the scenario.** A system-requirement is a single Gherkin scenario — there is no
   `scenarios: [...]` array nesting scenarios inside a sysreq. One file = one scenario = one sysreq.
   _(This corrects the design handoff's nested `sysreq.scenarios[]` shape — flagged for confirmation
   in §9.)_
2. **Slug = scenario name = identity.** No opaque `sysreq-44` ids, no author-assigned scenario `id`.
   The filename is the stable identity, consistent with every other Studio kind. This dissolves the
   id-stability problem entirely.

---

## 1. What this module is

**Proving requirements are met** — _"is this requirement actually proven, and by what evidence?"_ —
not "what links to what."

The model insight (from Enterprise `lib/db/src/schema/projects.ts`):

> _"A Gherkin scenario **IS** a system-requirement in v4 — there is no separate `scenario` artifact
> type."_

The requirement doesn't _have_ a test; the requirement **is** a test. So there's no mapping problem
and no spec-vs-suite drift: the artifact being traced and the artifact being executed are the same
file. The chain terminates in proof (`proven-by`), not in a build slice.

**Why it has weight:** a requirements traceability matrix — every requirement, its verification, its
evidence — is a compliance artifact under IEC 62304 / ISO 13485 / FDA software guidance, universally
produced by hand at audit time. Studio generates it continuously from files that already exist.

## 2. The open-core line (cite this; don't re-derive)

- **In the repo → open.** Every artifact kind here (actor, feature, user-requirement,
  system-requirement) is file-native, Apache-2.0, fully usable standalone.
- **The resolved graph + teams/seats → Enterprise.** Standalone resolves refs within _one_ tree and
  renders unresolvable ones inert. Enterprise resolves the _cross-project_ graph, persistently, for
  a team. Resolution is the moat — not the format.

## 3. The emitter (load-bearing)

A named convention binding sysreq artifacts to a test toolchain **in both directions**. Ships
`cucumber` + `junit`. Conventions surfaced in the UI:

| Convention                | Meaning                                          |
| ------------------------- | ------------------------------------------------ |
| `feature-file-per-sysreq` | each sysreq emits one `.feature` scenario        |
| `req-tag-on-scenario`     | emitted scenarios carry the sysreq slug as a tag |
| `outline-from-examples`   | a sysreq's `examples` table → Scenario Outline   |

- **Emit (greenfield):** sysreq → test files; coverage total by construction.
- **Ingest (brownfield):** existing suite tags scenarios with sysreq slugs; Cucumber JSON / JUnit
  XML maps back by the _same_ convention.

The emitter is the module's provider seam. Conformance = **round-trip** (emit → run → ingest → the
same sysreqs proven).

---

## 4. THE MODEL (validate this)

Chain:

```
actor
  ▼
user-requirement ──(userReqs)── system-requirement ──(proven-by)── evidence
     │                               │
  (features)                     (feature)
     └────────► feature ◄───────────┘
```

Layout — file per artifact, slug = path stem, identity is structural:

```
actors/
  dev-lead.yml
features/
  element-authoring.yml
requirements/
  user/
    authoring-flow.yml
  system/
    inline-create-persists.yml       # named for the SCENARIO it asserts
    inline-create-each-kind.yml
.runs/
  2026-07-09T02-14Z.json             # ingested, not authored
```

### 4.1 actor

Closed vocabulary the user-requirements reference. Own kind so the set is typo-proof.

```yaml
# actors/dev-lead.yml
apiVersion: workspec.io/v1alpha1
kind: Actor
metadata:
  slug: dev-lead
spec:
  name: Dev lead
  description: Runs a build, delegates slices, owns signoff.
```

### 4.2 feature

Thin container / grouping edge. `product` scopes it in a multi-product estate.

```yaml
# features/element-authoring.yml
apiVersion: workspec.io/v1alpha1
kind: Feature
metadata:
  slug: element-authoring
spec:
  name: Element authoring
  product: workspec-studio
```

### 4.3 user-requirement

The requirement in user-story form — **the artifact the RTM actually traces.** "As X I want Y so
that Z" is the promise that must be verified.

```yaml
# requirements/user/authoring-flow.yml
apiVersion: workspec.io/v1alpha1
kind: UserRequirement
metadata:
  slug: authoring-flow
spec:
  title: Author an element without leaving the canvas
  actor: dev-lead # intra-tree ref → actors/*
  as: a dev lead
  want: to author a new element inline on the canvas
  so: that I don't break flow switching to a form
  features: [element-authoring] # intra-tree refs → features/*
  status: agreed # draft | agreed | implemented | verified
  links:
    - kind: need
      ref: need:frictionless-authoring # cross-layer → inert standalone, resolves in Enterprise
```

### 4.4 system-requirement — **the file IS the scenario**

One Gherkin scenario per file. The scenario name is the slug is the identity. No nested
`scenarios[]`, no scenario `id`.

```yaml
# requirements/system/inline-create-persists.yml
apiVersion: workspec.io/v1alpha1
kind: SystemRequirement
metadata:
  slug: inline-create-persists # scenario name = slug = identity
spec:
  title: Creating an element inline saves it immediately
  feature: element-authoring # intra-tree ref (containing)
  userReqs: [authoring-flow] # intra-tree refs (verifies — makes it an RTM)
  given:
    - a canvas with no selected element
  when:
    - the dev lead double-clicks empty canvas
    - and types a name and presses Enter
  then:
    - the element is persisted
    - and appears in the repo tree without a form submit
```

With an examples table → Scenario Outline (still one scenario, one file):

```yaml
# requirements/system/inline-create-each-kind.yml
apiVersion: workspec.io/v1alpha1
kind: SystemRequirement
metadata:
  slug: inline-create-each-kind
spec:
  title: Inline create works for each element kind
  feature: element-authoring
  userReqs: [authoring-flow]
  given:
    - a canvas
  when:
    - the dev lead inline-creates a "<kind>"
  then:
    - a valid "<kind>" artifact is written
  examples:
    - { kind: component }
    - { kind: container }
    - { kind: database }
```

### 4.5 evidence (testrun) — ingested, never authored

Produced by `workspec-trace ingest`. **Keys on the sysreq slug alone** — because the file is the
scenario, there's no composite `<sysreq>/<id>` key and no scenario id to stabilise.

```json
// .runs/2026-07-09T02-14Z.json
{
  "id": "2026-07-09T02-14Z",
  "ts": "2026-07-09T02:14:07Z",
  "sha": "a1b2c3d",
  "ci": "github-actions",
  "emitter": "cucumber",
  "results": {
    "inline-create-persists": "pass",
    "inline-create-each-kind": "pass"
  }
}
```

`pass` / `fail` / `skip` / _absence_ are distinct. Absence → **unproven**.

### 4.6 What the graph DERIVES (nothing above stores an edge or status)

| Derived              | From                                                    |
| -------------------- | ------------------------------------------------------- |
| `verifies(userReq)`  | sysreqs whose `userReqs` include it                     |
| `proven-by(sysreq)`  | latest run's result for its slug                        |
| `unproven(sysreq)`   | in tree, absent from latest run (derived, never stored) |
| `coverage`           | userReqs with ≥1 passing sysreq ÷ all userReqs          |
| `pass rate`          | passing sysreqs ÷ sysreqs with evidence                 |
| `orphan feature`     | feature with no userReqs / no sysreqs                   |
| **`orphan userReq`** | **userReq no sysreq verifies — an unverified promise**  |

The last row is the module's single most valuable finding and only exists because user-requirements
are in the model (Option B): a promise to a user with no test proving it's kept.

### 4.7 Ref conventions (every module inherits these)

- **Kind-qualified for cross-kind links:** `need:frictionless-authoring`. Lets the loader type-check
  the target without resolving.
- **Bare slug for single-kind fields:** `actor: dev-lead`, `feature: element-authoring`,
  `userReqs: [authoring-flow]` — the field implies the kind.

Resolution rule (schema declares per field which bucket it's in):

- **Intra-tree** ref that doesn't resolve → **dangling → `verify` fails.** (typo protection)
- **Cross-layer** ref (target kind is Enterprise-only, e.g. `need`, `persona`) that doesn't resolve
  → **inert → allowed**, rendered as a quiet "resolves across your estate" label.

---

## 5. Surfaces (design authoritative)

Shell `workspec-trace / traceability`, emitter chip, counts, then the persistent **meters bar** —
**Coverage** and **Pass rate** side by side, never collapsed to one number (100% pass over 40%
coverage is the lie every test dashboard tells).

Four views: **Requirements** (explorer, click row → chain) · **Matrix** (the RTM, exportable) ·
**Feature detail** (feature → userReqs → sysreqs, no-sysreqs case explicit) · **Run review**
(failures foregrounded).

Consume `@workspec/design`; define no local tokens. Host contract per every Studio module
(`repository`, `links` resolver, `capabilities`, MF-exposed).

## 6. CLI (`workspec-trace`)

- `emit --emitter cucumber [--feature <slug>]` — sysreqs → test files.
- `ingest <results> --emitter junit|cucumber` — results → evidence.
- `verify` — **CI gate:** fails on coverage/pass-rate regression _and_ on dangling intra-tree refs;
  thresholds configurable.
- `matrix --out matrix.{md,csv,html}` — the RTM as a generated artifact (the compliance payload).
- `render` — deterministic SVG of a feature's proof state.

## 7. Packages

```
packages/req-schema      # actor/feature/user-requirement/system-requirement → registry v1alpha1
packages/trace-model     # evidence join, coverage/pass/unproven + orphan derivation (pure)
packages/trace-emitters  # cucumber | junit — emit + ingest, one convention set each
packages/trace-ui        # the four views (design-system-native, MF remote)
packages/trace-studio    # CLI + standalone host
```

`trace-emitters` seam: each emitter = `emit(sysreqs) → files` + `ingest(results) → evidence[]` +
declared conventions. Conformance = round-trip.

## 8. Build sequence

1. `req-schema` — the four kinds, registry-published, conformance-checked against the Enterprise
   tree.
2. `trace-model` — derivation engine + golden fixtures.
3. `trace-emitters` cucumber (emit + ingest) + round-trip conformance.
4. `emit` / `ingest` / `verify` CLI — **shippable value, zero frontend.**
5. `trace-ui` Requirements + Feature detail.
6. Matrix view + `matrix` export — the compliance payload.
7. Run review; junit emitter.
8. Studio shell `/traceability`, site page, demo seeded with the worked example (the repo proving
   its own requirements).

## 9. Open items (validate)

1. **§4.4 confirm the file-is-the-scenario correction** — the design handoff nests
   `sysreq.scenarios[]`; this spec flattens to one-scenario-per-file. If confirmed, the design's
   data model inherits the same edit before T5. **This is the load-bearing validation.**
2. **§4.3 the `need` upward ref** — invented to illustrate the cross-layer inert case. Confirm `need`
   (vs `persona`) is the right parent kind; depends on Enterprise's chain above user-requirements
   (unread — flag if you want it verified before T1 freezes).
3. **Evidence location** — `.runs/` configurable, default gitignored; committing documented as the
   auditable-proof-history pattern.
4. **Multi-run history** — v0 latest-run-only; coverage-over-time is v0.1.
5. **Cross-project manifest (#77)** — Enterprise-side cross-tree resolution; standalone is
   single-tree. Not gating v0.
