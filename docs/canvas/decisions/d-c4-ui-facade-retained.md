# D — `@workspec/c4-ui` retained as the composition facade

- **Status:** Accepted
- **Deciders:** Fieldstate Dev Lead
- **Decided:** 2026-08-02
- **Format note:** authored as a **markdown ADR**, not a `*.decision.yaml`, per the repo's
  decision-format rule ([`docs/decisions/workspec-tech-spec-v0.1.md`](../../decisions/workspec-tech-spec-v0.1.md)
  §6): the costed format fits when every compared option carries a positive, graded cost/effort;
  this is a scope/constraint-driven call ratified directly in the epic body, not a weighted cost
  comparison. Ratified in [Epic #116](https://github.com/FieldstateNZ/workspec-studio/issues/116)
  as decision **D**; recorded per [D0 #123](https://github.com/FieldstateNZ/workspec-studio/issues/123).

## Context

`@workspec/c4-ui` is an existing package with an existing module-federation (MF) contract: it is
published as the `c4Ui` remote with 3 exposes, and the site (and other consumers) already pin to
that remote name and those exposes. The canvas extraction recomposes C4 rendering on top of the
new `@workspec/canvas` + `@workspec/canvas-c4` packages (decision **B**) — the question is whether
`c4-ui` survives that recomposition as a real package or is dissolved into the new ones.

## Options considered

- **Keep `@workspec/c4-ui` as the composition facade** (chosen). Same props, same MF contract
  (`c4Ui` remote, 3 exposes); internally it is recomposed to sit on `canvas` + `canvas-c4` instead
  of its previous implementation. MF remote name/exposes and existing site pins survive, with only
  an alpha version bump.
- **Dissolve `c4-ui` and have consumers depend on `canvas-c4` directly**, updating the MF remote
  name/exposes and every site pin to match. Rejected: this breaks the existing MF contract for no
  functional gain — the facade's whole job is to keep the public surface (props, remote name,
  exposes) stable while the implementation underneath is replaced, which is exactly the point of
  having a facade package in the first place.

## Decision

`@workspec/c4-ui` is retained as the composition facade over `@workspec/canvas` +
`@workspec/canvas-c4`. Its props and MF contract (`c4Ui` remote, 3 exposes) are unchanged; existing
site pins keep working across an alpha version bump.

## Consequences

- **+** No breaking change propagates to the site or any other MF consumer of `c4-ui` — the
  facade absorbs the internal recomposition.
- **+** The facade boundary is exactly where slice S4 lands the facade swap and the parity harness
  (renderSvg on shared geometry, a11y as acceptance), keeping that verification scoped to one
  package rather than every consumer.
- **−** `c4-ui` inherits the epic's React 18/19 dual-support risk (top risk #4): because it is an
  MF singleton, CI must run on React 18.3, the mf-host Playwright smoke must gate merge, and no
  19-only APIs can be used anywhere in the facade or the packages it composes.
- **−** The facade must be kept honest about being a thin composition layer — if implementation
  details leak through its props over time, it stops doing the job this decision assigns it
  (isolating consumers from the `canvas`/`canvas-c4` internals).
