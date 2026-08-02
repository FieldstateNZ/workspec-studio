# Sequencing deviation — no in-enterprise refactor PR; factory refactor lands during the port

- **Status:** Accepted
- **Deciders:** Fieldstate Dev Lead
- **Decided:** 2026-08-02
- **Format note:** authored as a **markdown ADR**, not a `*.decision.yaml`, per the repo's
  decision-format rule ([`docs/decisions/workspec-tech-spec-v0.1.md`](../../decisions/workspec-tech-spec-v0.1.md)
  §6): the costed format fits when every compared option carries a positive, graded cost/effort;
  this is a scope/constraint-driven call ratified directly in the epic body, not a weighted cost
  comparison. Ratified in [Epic #116](https://github.com/FieldstateNZ/workspec-studio/issues/116)
  as the epic's sequencing deviation; recorded per
  [D0 #123](https://github.com/FieldstateNZ/workspec-studio/issues/123).

## Context

The sprint synthesis that produced this epic originally called for a preparatory step: land a
singleton→factory refactor PR **inside the enterprise repo** first, then port the already-refactored
engine out into the new OSS packages. Between that synthesis and this epic, the enterprise repo's
own state changed — the refactor's target code is now mid-flight on an unrelated branch in the
enterprise repo, which the epic's decisions (**B**, **C**) depend on: the store-factory rewrite
(zustand v5, ~70 internal + 18 enterprise `useCanvasStore` call sites) is exactly the
singleton→factory change the original synthesis wanted done in enterprise first.

## Options considered

- **No refactor PR lands inside the enterprise repo; the factory refactor happens during the port**
  (chosen). The singleton→factory rewrite (decisions B, C) is done directly as part of extracting
  the code into `@workspec/canvas`, guarded by contract tests that preserve the
  `useCanvasStore(selector)` call signature exactly. Enterprise re-adoption of the resulting shared
  package is validated separately, as a spike in slice **S6** — a report plus a draft diff, with
  nothing merged back into enterprise this sprint.
- **Land the refactor PR inside the enterprise repo first, as the original synthesis specified**,
  then port the refactored code out. Rejected for this sprint: the refactor's target code is
  mid-flight on an unrelated enterprise branch, so landing a competing refactor PR there now would
  either conflict with that in-flight work or force sequencing this epic behind it, blocking the
  canvas extraction on a change happening in a different repo on a different timeline.

## Decision

The singleton→factory refactor is not staged as a separate PR inside the enterprise repo. It
happens directly during the port into `@workspec/canvas`, protected by contract tests on the
`useCanvasStore(selector)` signature. Slice S6 validates that the ported package can be re-adopted
by enterprise as a spike — report and draft diff only, nothing merged — deferring the actual
enterprise-side merge to a follow-up.

## Consequences

- **+** The canvas extraction is not blocked on enterprise-repo timing it does not control (the
  unrelated in-flight branch).
- **+** The contract tests that guard `useCanvasStore(selector)` give the same safety the
  originally-planned enterprise-first refactor was meant to provide, without requiring that PR to
  exist.
- **+** S6's report-and-draft-diff scope (nothing merged) means enterprise re-adoption risk is
  surfaced and documented this sprint even though it isn't resolved this sprint.
- **−** Enterprise re-adoption is now genuinely deferred: the shared package's fitness for
  enterprise is validated by a spike, not by an actual merge, so unknowns can remain until that
  follow-up lands.
- **−** Because the refactor is proven against the OSS studio's call sites during the port rather
  than against enterprise's actual ~18 call sites in a real PR, the S6 spike carries the burden of
  catching any enterprise-specific usage the contract tests didn't anticipate.
