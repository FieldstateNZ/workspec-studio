# A — ELK positions + ported orthogonal router for edge rendering

- **Status:** Accepted
- **Deciders:** Fieldstate Dev Lead
- **Decided:** 2026-08-02
- **Format note:** authored as a **markdown ADR**, not a `*.decision.yaml`, per the repo's
  decision-format rule ([`docs/decisions/workspec-tech-spec-v0.1.md`](../../decisions/workspec-tech-spec-v0.1.md)
  §6): the costed format fits when every compared option carries a positive, graded cost/effort;
  this is a scope/constraint-driven call ratified directly in the epic body, not a weighted cost
  comparison. Ratified in [Epic #116](https://github.com/FieldstateNZ/workspec-studio/issues/116)
  as decision **A**; recorded per [D0 #123](https://github.com/FieldstateNZ/workspec-studio/issues/123).

## Context

The studio's C4 render is far behind the enterprise WorkSpec canvas (badged cards, pill edge
labels, dotted grid, orthogonal routing, minimap, lens tabs). Rather than restyle the SVG
renderer, the enterprise canvas engine is extracted into shared OSS packages and the studio C4
surface is recomposed on top of it. `c4-schema` / `c4-model` / `c4-layout` / `c4-studio` are kept
as-is: **elk remains the position authority**, and the `.layout` pin round-trip
(`serializeForWrite` merge semantics) is contract — node positions do not change source. What
does change is how edges are drawn: edge *rendering* moves to the ported enterprise orthogonal
router, which routes from the final rects computed by elk. `.layout` edge waypoints become
advisory rather than authoritative; the artifact schema is unchanged.

## Options considered

- **ELK positions + ported orthogonal router (chosen).** Keep elk as the sole position authority
  (no change to node coordinates or the `.layout` contract); port the enterprise's orthogonal
  edge router to draw edges from elk's final rects. Parity with the enterprise canvas is defined
  as **chrome/interaction parity** (card treatment, edge pill labels, hover/selection, grid) —
  not node-coordinate parity, since the two systems use different layout engines.
- **Port dagre** (the enterprise's own layout engine) to get exact node-coordinate parity with
  the enterprise canvas. Rejected: this would mean running two competing layout engines across
  the studio (elk for existing C4 consumers, dagre for parity), duplicating the `.layout`
  contract's authority, and re-litigating the elk decision the C4 family already made. The
  studio's C4 tooling (`c4-layout`, `c4-studio`, the `.layout` pin/round-trip) is elk-native and
  is explicitly kept unchanged by this epic.

## Decision

Node positions keep coming from elk; only edge rendering is replaced, by the ported orthogonal
router operating on elk's output rects. Visual parity with the enterprise canvas is judged on
chrome and interaction, not on matching dagre's node coordinates.

## Consequences

- **+** No disruption to the existing `.layout` contract, `serializeForWrite` merge semantics, or
  any current elk-based consumer (`c4-layout`, `c4-studio`).
- **+** One layout engine in the studio, not two competing ones.
- **+** The router is a pure function of final rects, so it composes cleanly with any position
  source — elk today, without hard-wiring dagre-specific assumptions into the ported code.
- **−** `.layout` edge waypoints become advisory rather than authoritative once the router owns
  edge drawing; any consumer that relied on `.layout` waypoint values for edge geometry needs to
  move to the router's output.
- **−** Visual parity is only chrome/interaction-level: elk and dagre place nodes differently, so
  a pixel-identical side-by-side with the enterprise canvas is not a goal, and parity checks
  (Playwright screenshot goldens) must accept node-position deltas while still diffing edge
  treatment, card chrome, grid, and hover/selection.
