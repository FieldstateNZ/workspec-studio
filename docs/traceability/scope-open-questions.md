# Traceability Workbench — v0 scope decision (for BA review)

**Status:** open — needs a decision before implementation of `req-schema` (T1) begins.
**Owner of the decision:** Brett / BA.
**Prepared by:** dev lead, from the [v0 spec](spec.md) and the committed design handoff
([`docs/design/Traceability Workbench.dc.html`](../design/Traceability%20Workbench.dc.html)).

The module is bootstrapped (T0 — five empty package skeletons merged) and the T1–T8 backlog is
filed (epic **#78**). T1 defines the artifact **schema**, and it is blocked on one question the
spec and the design answer differently. Everything downstream (the model T2, the UI T5, the matrix
T6) inherits the answer, so getting it right up front avoids rework across three slices.

---

## The one open question

**Is `user-requirement` (and `actor`) a v0 artifact kind, or is v0 strictly `sysreq` + `feature`?**

The spec and the design disagree.

### What the spec says — SysReq + feature only

[spec.md §4](spec.md), verbatim:

> The module needs SysReq/Gherkin artifacts in Studio — the Gherkin end of the chain, **not** all
> of WorkSpec's discovery model. Much smaller than open-sourcing personas/needs/user-requirements,
> and it's **the only new kind this module requires**.

So per the written spec, v0 introduces exactly two kinds: **`sysreq`** (a Gherkin scenario set —
the file _is_ the requirement) and **`feature`** (the containing edge). User-requirements, personas,
and actors are explicitly excluded — deliberately, to keep the free/Enterprise line where it is
(the discovery model stays Enterprise's).

### What the design shows — a three-kind chain incl. user-requirements + actors

The design handoff's data model (`docs/design/Traceability Workbench.dc.html`) is built on a
**four-kind** model — `feature`, `user-requirement`, `sysreq`, plus ingested `testrun` evidence —
and both user-requirements and sysreqs are first-class throughout the UI (explorer, matrix, counts):

- `this.USERREQS.forEach(…)` — line 543, 612
- `this.SYSREQS.filter/forEach(…)` — line 547, 556, 618
- `this.USERREQS.length` / `this.SYSREQS.length` — line 628–629 (both counted in the topbar)
- `userReqs.map/forEach(…)` in the matrix/detail rendering — line 623, 724

The design's actual data shapes (extracted from the handoff):

| Kind                 | Shape (fields)                                                                                             | In spec §4? |
| -------------------- | ---------------------------------------------------------------------------------------------------------- | ----------- |
| `feature`            | `{ slug, name, product }`                                                                                  | yes (edge)  |
| `user-requirement`   | `{ slug, title, actor, features:[slug], status, as, want, so }` — user-story format                        | **no**      |
| `actor`              | `{ 'dev-lead':'Dev lead', engineer:'Engineer', 'ci-runner':'CI runner', auditor:'Auditor' }`               | **no**      |
| `sysreq`             | `{ slug, title, feature, userReqs:[slug], scenarios:[{ id, title, given[], when[], then[], examples? }] }` | yes         |
| `testrun` (evidence) | `{ id, ts, sha, ci, results: { '<sysreq>/<scenarioId>': 'pass'\|'fail'\|'skip' } }` — ingested             | n/a (§3)    |

Notes from the design:

- SysReq scenarios require an **author-assigned `id`** (positional ids are rejected — design sysreq
  `id-stability`), and carry Gherkin `given/when/then` (+ optional `examples` → Scenario Outline).
- A sysreq references its `feature` (containing edge) **and** its `userReqs` (upward edges).
- User-requirement statuses seen in the design: `draft`, `agreed`, `implemented`, `verified`.

---

## Why it matters (business, not just tidiness)

This is the same seam the spec flags for the whole module: **user-requirements carry `as/want/so`
and an `actor` — that is the discovery model, not the test surface.** Making them file-native/free
moves the free/Enterprise line: it opens the _discovery_ vocabulary, not just the Gherkin/proof end.
The spec chose to _not_ do that in v0 on purpose ("much smaller than open-sourcing
personas/needs/user-requirements"). The design chose to show it. Someone should pick, not drift.

---

## Options

### Option A — Spec scope: `sysreq` + `feature` only (dev-lead recommendation)

- Two authored kinds. SysReq keeps its `userReqs` field as **refs** that render **inert** when
  unresolvable (the established Studio "links resolve in Enterprise, inert standalone" pattern), so
  the schema is forward-compatible if user-requirements are added later — no rework to the sysreq
  shape.
- The v0 Requirements explorer and Matrix center on **SysReqs**; the design's user-requirement rows
  (`as/want/so`) are deferred to v0.1.
- **Pros:** matches the written spec; keeps the free/Enterprise line intact; smallest T1/T2/T5;
  ships the module's actual claim (coverage/pass-rate over provable SysReqs) fastest.
- **Cons:** the shipped UI is a subset of the design — the explorer/matrix won't show the
  user-story rows the handoff renders, so the design is not honoured "as drawn" in v0.

### Option B — Design scope: `sysreq` + `feature` + `user-requirement` + `actor`

- Four authored kinds, matching the design's model and its explorer/matrix as-shipped.
- **Pros:** the UI matches the design with no deferral; the "honest requirement graph" the design
  centres on (userReq → sysReq → evidence) is whole.
- **Cons:** contradicts §4's "only new kind" wording; **moves the free/Enterprise line** (opens the
  discovery model); larger T1 (two more kinds + actor vocabulary), T2 (userReq→feature rollups), and
  T5 (userReq surfaces). This is a product/positioning decision, not just an implementation size.

### Option C — Reconcile the spec and the design first

Update §4 (or trim the design's user-requirement surfaces) so scope is unambiguous, then brief T1.
Cleanest if the answer isn't obvious to the BA from A/B.

---

## Dev-lead recommendation

**Option A**, because the spec is the explicit scope authority and the free/Enterprise-line argument
in §1–§4 is deliberate — but with the sysreq schema carrying **inert `userReqs` refs** so Option B
remains a clean, additive follow-up (add the `user-requirement`/`actor` kinds + their surfaces; the
sysreq shape doesn't change). That preserves the spec's line now and the design's full vision later,
without repainting the schema.

The decision is genuinely a business/positioning one (does the discovery vocabulary go
free-and-file-native in v0?), which is why it's here for the BA rather than being made in the schema
PR.

---

## Secondary open items (already tracked; listed for completeness)

These don't block T1 and have working defaults on epic #78, but a BA reviewing scope should see them:

1. **Evidence location** — `.runs/` configurable, **default gitignored**; committing documented as
   the regulated-user (auditable proof-history) pattern. (spec §9.1)
2. **Multi-run history** — v0 shows the latest run only; coverage-over-time trend is v0.1. (spec §9.2)
3. **Cross-project manifest** — now wanted by topology, cost, and traceability; tracked as **#77**,
   not gating v0 (single-tree). (spec §8/§9.4)
4. **`testrun`/Evidence schema home** — evidence is ingested-not-authored (§3); whether its shape is
   a `req-schema` artifact schema or a `trace-model` type is an implementation boundary to settle at
   T2/T3, not a product decision.
