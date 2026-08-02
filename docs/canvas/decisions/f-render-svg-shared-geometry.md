# F — `renderSvg` regenerated on the shared geometry

- **Status:** Accepted
- **Deciders:** Fieldstate Dev Lead
- **Decided:** 2026-08-02
- **Format note:** authored as a **markdown ADR**, not a `*.decision.yaml`, per the repo's
  decision-format rule ([`docs/decisions/workspec-tech-spec-v0.1.md`](../../decisions/workspec-tech-spec-v0.1.md)
  §6): the costed format fits when every compared option carries a positive, graded cost/effort;
  this is a scope/constraint-driven call ratified directly in the epic body, not a weighted cost
  comparison. Ratified in [Epic #116](https://github.com/FieldstateNZ/workspec-studio/issues/116)
  as decision **F**; recorded per [D0 #123](https://github.com/FieldstateNZ/workspec-studio/issues/123).

## Context

Decision **A** moves edge *rendering* onto the ported orthogonal router (routing from elk's final
rects, with `.layout` edge waypoints becoming advisory). `c4-ui`'s static SVG export path
(`renderSvg`) previously generated its own edge geometry independently of the interactive canvas.
The repo already carries a `render-svg.shared-modules` invariant — the property that the static
export and the interactive canvas draw from the same geometry rather than two parallel
implementations that can drift apart.

## Options considered

- **Regenerate `renderSvg` on the shared geometry** (chosen): the static SVG export consumes the
  same router + node-module output the interactive canvas uses, rather than computing its own
  edge paths. This preserves the existing `render-svg.shared-modules` invariant across the
  extraction.
- **Keep `renderSvg` on its own, independent geometry implementation.** Rejected: this would break
  the `render-svg.shared-modules` invariant the moment edge rendering moves to the ported router
  (decision A) — the static export and the interactive canvas would draw edges differently,
  reintroducing exactly the kind of visual drift the invariant exists to prevent.

## Decision

`renderSvg` is regenerated to read from the shared geometry (the ported router's output plus the
open node/shape modules), so the static SVG export and the interactive canvas stay backed by one
geometry implementation. The `render-svg.shared-modules` invariant is preserved through the
extraction, not just at decision A's node-position level.

## Consequences

- **+** Static exports (SVG) and the live canvas cannot visually diverge on edge treatment — one
  geometry source feeds both.
- **+** Slice S4 (`c4-ui` facade swap + `renderSvg` on shared geometry + parity harness) has a
  single, well-defined target: point the export path at the same router/module output the canvas
  uses, rather than reconciling two implementations.
- **−** `renderSvg` becomes dependent on whatever the router and shape modules produce, so any
  future change to edge routing or node-module geometry must be checked against the static export
  path as well as the interactive one — verified by the epic's contract tests (a committed
  edge-route snapshot for the router, and the golden layout snapshot).
- **−** This adds a real coupling between the export path and the canvas engine internals that did
  not exist when `renderSvg` computed its own geometry; a regression in the shared geometry now
  affects both surfaces simultaneously instead of being isolated to one.
