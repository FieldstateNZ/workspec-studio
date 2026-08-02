# G — OSS v1 shape scope

- **Status:** Accepted
- **Deciders:** Fieldstate Dev Lead
- **Decided:** 2026-08-02
- **Format note:** authored as a **markdown ADR**, not a `*.decision.yaml`, per the repo's
  decision-format rule ([`docs/decisions/workspec-tech-spec-v0.1.md`](../../decisions/workspec-tech-spec-v0.1.md)
  §6): the costed format fits when every compared option carries a positive, graded cost/effort;
  this is a scope/constraint-driven call ratified directly in the epic body, not a weighted cost
  comparison. Ratified in [Epic #116](https://github.com/FieldstateNZ/workspec-studio/issues/116)
  as decision **G**; recorded per [D0 #123](https://github.com/FieldstateNZ/workspec-studio/issues/123).

## Context

`@workspec/canvas` ships an **open** `ShapeModule` registry (decision B), but the enterprise
canvas carries a much larger shape catalog than C4 + the whiteboard basics: prototype/wireframe/
flow shapes, an atlas shape, and artifact-graph/topology/cost-specific shapes. The extraction has
to draw a line on which shapes actually ship in the OSS v1 packages versus which stay enterprise
code that could, in principle, register against the same open registry later.

## Options considered

- **Curated v1 scope: C4 set + whiteboard base + connector** (chosen). `@workspec/canvas` ships
  the whiteboard base shapes (sticky/text/draw/image) and the orthogonal connector family;
  `@workspec/canvas-c4` ships the C4 shape set (`c4node`/`c4boundary`). Prototype/wireframe/flow
  shapes, the atlas shape, and artifact-graph/topology/cost shapes are left in enterprise code,
  not ported.
- **Port the full enterprise shape catalog into OSS v1** — prototype/wireframe/flow, atlas, and
  artifact-graph/topology/cost shapes alongside C4 and the whiteboard base. Rejected: none of
  those shapes are needed for the epic's actual goal (C4 studio parity), each one is additional
  surface to design as an *open* `ShapeModule` (not just port as-is), and each is additional
  surface for the token-audit test, visual-parity goldens, and the strict-TS pilot to cover before
  v1 can ship.

## Decision

OSS v1 ships exactly the C4 shape set, the whiteboard base shapes (sticky/text/draw/image), and
the connector family — nothing more. Prototype/wireframe/flow, atlas, and artifact-graph/
topology/cost shapes remain enterprise-only for this sprint; they are not precluded from being
ported later against the same open `ShapeModule` registry, just out of v1 scope.

## Consequences

- **+** v1's surface area matches its actual acceptance criteria (C4 studio parity) — nothing is
  built that verification (token audit, visual-parity goldens, contract tests) doesn't need to
  cover.
- **+** The open `ShapeModule` registry still gets validated by two genuinely different shape
  families (C4 + whiteboard/connector) rather than by C4 alone, so "open" isn't just theoretical.
- **−** Any future OSS consumer wanting prototype/wireframe/flow, atlas, or artifact-graph/
  topology/cost shapes has to wait for a follow-up port; this sprint does not schedule one.
- **−** The enterprise re-adoption spike (S6) only has to reconcile the shapes that *did* ship in
  v1 — it does not validate that the unported shape families would register cleanly against the
  new open registry, so that remains an open question for whenever they are ported.
