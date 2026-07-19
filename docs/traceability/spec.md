# WorkSpec Studio — Traceability Workbench Spec (v0)

**Status:** validated. Contains the full artifact model inline (§4) — the part frozen by
`req-schema` (T1).
**Repo:** `FieldstateNZ/workspec-studio` · CLI: `workspec-trace`
**Design:** [`docs/design/Traceability Workbench.dc.html`](../design/Traceability%20Workbench.dc.html)
(authoritative for surfaces).
**Scope decision:** **Option B confirmed** — WorkSpec is open-source; anything living in the repo
is open. All artifact kinds are file-native. Enterprise's moat is the resolved linkage graph +
teams/seats, not the artifact model.

**The model, in one line:** the real Gherkin hierarchy, file-native. A **feature** groups
**user-requirements** (promises) and **system-requirements**; a system-requirement **is a Gherkin
Rule** that groups **scenarios**; a scenario is the executed unit that terminates in proof
(`proven-by`). Five kinds, one file each.

> **Model revision (supersedes the earlier "file IS the scenario" cut).** An earlier draft
> collapsed a system-requirement to a single scenario. The validated model restores the Gherkin
> **Rule** as its own layer between feature and scenario: a **system-requirement = a Rule**, and a
> **scenario is its own (fifth) file-native kind** referencing its parent Rule. This matches how a
> `.feature` file is authored (`Feature:` › `Rule:` › `Scenario:`) and the design's data model.
> Evidence keys on the **scenario** slug.

---

## 1. What this module is

**Proving requirements are met** — _"is this requirement actually proven, and by what evidence?"_ —
not "what links to what."

A **system-requirement is a Gherkin Rule**: a named, verifiable statement that groups the
**scenarios** which prove it. The scenarios ARE the tests — so there's no spec-vs-suite mapping
problem and no drift: the artifacts being traced (scenarios) and the artifacts being executed are
the same files. The chain terminates in proof (`proven-by`), not in a build slice.

**Why it has weight:** a requirements traceability matrix — every requirement, its verification, its
evidence — is a compliance artifact under IEC 62304 / ISO 13485 / FDA software guidance, universally
produced by hand at audit time. Studio generates it continuously from files that already exist.

## 2. The open-core line (cite this; don't re-derive)

- **In the repo → open.** Every artifact kind here (actor, feature, user-requirement,
  system-requirement, scenario) is file-native, Apache-2.0, fully usable standalone.
- **The resolved graph + teams/seats → Enterprise.** Standalone resolves refs within _one_ tree and
  renders unresolvable ones inert. Enterprise resolves the _cross-project_ graph, persistently, for
  a team. Resolution is the moat — not the format.

## 3. The emitter (load-bearing)

A named convention binding sysreq/scenario artifacts to a test toolchain **in both directions**.
Ships `cucumber` + `junit`. Conventions surfaced in the UI:

| Convention              | Meaning                                                   |
| ----------------------- | -------------------------------------------------------- |
| `feature-file-per-rule` | each sysreq (Rule) emits one `.feature` file             |
| `rule-groups-scenarios` | the file is `Feature:` › `Rule:` › its `Scenario:`s      |
| `req-tag-on-scenario`   | each emitted scenario carries its scenario slug as a tag |
| `outline-from-examples` | a scenario's `examples` table → a Scenario Outline       |

- **Emit (greenfield):** rule + scenarios → test files; coverage total by construction.
- **Ingest (brownfield):** existing suite tags scenarios with scenario slugs; Cucumber JSON / JUnit
  XML maps back by the _same_ convention.

The emitter is the module's provider seam. Conformance = **round-trip** (emit → run → ingest → the
same scenarios proven).

---

## 4. THE MODEL (validate this)

Chain:

```
actor
  ▼
user-requirement ──(userReqs)── system-requirement ──(systemRequirement)── scenario ──(proven-by)── evidence
     │                              │  (a Gherkin Rule)
  (features)                    (feature)
     └────────► feature ◄──────────┘
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
    inline-create.yml                  # a Rule — groups scenarios, has no steps of its own
scenarios/
  inline-create-persists.yml           # references system: inline-create
  inline-create-each-kind.yml
.runs/
  2026-07-09T02-14Z.json               # ingested, not authored; keyed on scenario slug
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

The requirement in user-story form — **the promise the RTM traces.** "As X I want Y so that Z" is
the promise that must be verified.

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

### 4.4 system-requirement — **a Gherkin Rule**

A named Rule that belongs to a feature, verifies user-requirements, and **groups scenarios**. It
has NO `given`/`when`/`then` of its own — the steps live on its scenarios (§4.5). The Rule is the
requirement; the scenarios are its proof.

```yaml
# requirements/system/inline-create.yml
apiVersion: workspec.io/v1alpha1
kind: SystemRequirement
metadata:
  slug: inline-create
spec:
  title: Inline element creation
  feature: element-authoring # intra-tree ref (containing)
  userReqs: [authoring-flow] # intra-tree refs (verifies — makes it an RTM)
```

A Rule with **no scenarios** is an **empty rule** — a requirement with no proof at all (a derived
finding, §4.7).

### 4.5 scenario — the executed unit (**fifth kind**)

One Gherkin scenario per file. The scenario name is the slug is the identity. It references its
parent Rule via `systemRequirement`.

```yaml
# scenarios/inline-create-persists.yml
apiVersion: workspec.io/v1alpha1
kind: Scenario
metadata:
  slug: inline-create-persists
spec:
  title: Creating an element inline saves it immediately
  systemRequirement: inline-create # intra-tree ref → requirements/system/* (its Rule)
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
# scenarios/inline-create-each-kind.yml
apiVersion: workspec.io/v1alpha1
kind: Scenario
metadata:
  slug: inline-create-each-kind
spec:
  title: Inline create works for each element kind
  systemRequirement: inline-create
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

### 4.6 evidence (testrun) — ingested, never authored

Produced by `workspec-trace ingest`. **Keys on the scenario slug alone** — the scenario is the
executed unit and its own kind, so there is no composite `<sysreq>/<scenario>` key.

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

### 4.7 What the graph DERIVES (nothing above stores an edge or status)

| Derived                 | From                                                                   |
| ----------------------- | ---------------------------------------------------------------------- |
| `scenariosOf(sysreq)`   | scenarios whose `systemRequirement` is it                              |
| `verifies(userReq)`     | sysreqs whose `userReqs` include it                                    |
| `proven-by(scenario)`   | latest run's result for its slug                                       |
| `unproven(scenario)`    | in tree, absent from latest run (derived, never stored)                |
| `rule-proven(sysreq)`   | the Rule has ≥1 scenario AND every scenario passes in the latest run   |
| **`scenario coverage`** | scenarios with a result in the latest run ÷ all scenarios              |
| **`pass rate`**         | passing scenarios ÷ scenarios with evidence in the latest run          |
| **`userReq coverage`**  | userReqs with ≥1 `rule-proven` verifying sysreq ÷ all userReqs         |
| `orphan feature`        | feature with no userReqs / no sysreqs                                  |
| **`orphan userReq`**    | **userReq no sysreq verifies — an unverified promise**                 |
| **`empty rule`**        | **sysreq (Rule) with no scenarios — a requirement with no proof**      |

**Three meters, never collapsed** (§5): **scenario coverage** (are the scenarios run?), **userReq
coverage** (are the promises verified?), **pass rate** (of what ran, how much passes?). 100% pass
over 40% coverage is the lie every test dashboard tells.

`orphan userReq` is the module's single most valuable finding and only exists because
user-requirements are in the model (Option B): a promise to a user with no Rule proving it's kept.

### 4.8 Ref conventions (every module inherits these)

- **Kind-qualified for cross-kind links:** `need:frictionless-authoring`. Lets the loader type-check
  the target without resolving.
- **Bare slug for single-kind fields:** `actor: dev-lead`, `feature: element-authoring`,
  `userReqs: [authoring-flow]`, `systemRequirement: inline-create` — the field implies the kind.

Resolution rule (schema declares per field which bucket it's in):

- **Intra-tree** ref that doesn't resolve → **dangling → `verify` fails.** (typo protection)
- **Cross-layer** ref (target kind is Enterprise-only, e.g. `need`, `persona`) that doesn't resolve
  → **inert → allowed**, rendered as a quiet "resolves across your estate" label.

---

## 5. Surfaces (design authoritative)

Shell `workspec-trace / traceability`, emitter chip, counts, then the persistent **meters bar** —
**Scenario coverage**, **UserReq coverage**, and **Pass rate**, side by side, never collapsed to one
number.

Four views: **Requirements** (explorer, click row → chain) · **Matrix** (the RTM — scenario rows
grouped by Rule → Feature, exportable) · **Feature detail** (feature → userReqs → sysreqs/Rules →
scenarios, no-scenario/no-sysreq cases explicit) · **Run review** (failures foregrounded).

Consume `@workspec/design`; define no local tokens. Host contract per every Studio module
(`repository`, `links` resolver, `capabilities`, MF-exposed).

## 6. CLI (`workspec-trace`)

- `emit --emitter cucumber [--feature <slug>]` — rules + scenarios → test files.
- `ingest <results> --emitter junit|cucumber` — results → evidence (keyed on scenario slug).
- `verify` — **CI gate:** fails on coverage/pass-rate regression _and_ on dangling intra-tree refs;
  thresholds configurable.
- `matrix --out matrix.{md,csv,html}` — the RTM as a generated artifact (the compliance payload).
- `render` — deterministic SVG of a feature's proof state.

## 7. Packages

```
packages/req-schema      # actor/feature/user-requirement/system-requirement/scenario → registry v1alpha1
packages/trace-model     # evidence join, three meters + rollup + orphan/empty derivation (pure)
packages/trace-emitters  # cucumber | junit — emit + ingest, one convention set each
packages/trace-ui        # the four views (design-system-native, MF remote)
packages/trace-studio    # CLI + standalone host
```

`trace-emitters` seam: each emitter = `emit(rules+scenarios) → files` + `ingest(results) → evidence[]`
+ declared conventions. Conformance = round-trip.

## 8. Build sequence

1. `req-schema` — the five kinds, registry-published, conformance-checked against the Enterprise
   tree.
2. `trace-model` — derivation engine (three meters + rollup) + golden fixtures.
3. `trace-emitters` cucumber (emit + ingest) + round-trip conformance.
4. `emit` / `ingest` / `verify` CLI — **shippable value, zero frontend.**
5. `trace-ui` Requirements + Feature detail.
6. Matrix view + `matrix` export — the compliance payload.
7. Run review; junit emitter.
8. Studio shell `/traceability`, site page, demo seeded with the worked example (the repo proving
   its own requirements).

## 9. Open items (validate)

1. **Rule-proven definition (§4.7)** — a Rule counts toward `userReq coverage` only when it has ≥1
   scenario and _every_ scenario passes (a strict "the requirement is met only if all its proof
   passes" reading). Confirm this vs a looser "≥1 scenario passes".
2. **§4.3 the `need` upward ref** — invented to illustrate the cross-layer inert case. Confirm `need`
   (vs `persona`) is the right parent kind; depends on Enterprise's chain above user-requirements
   (unread — flag if you want it verified before T1 freezes).
3. **Evidence location** — `.runs/` under `.workspec/`, configurable, default gitignored; committing
   documented as the auditable-proof-history pattern.
4. **Multi-run history** — v0 latest-run-only; coverage-over-time is v0.1.
5. **Cross-project manifest (#77)** — Enterprise-side cross-tree resolution; standalone is
   single-tree. Not gating v0.
