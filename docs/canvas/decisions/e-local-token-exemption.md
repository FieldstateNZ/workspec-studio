# E — Local-token exemption for v1; `@workspec/design` absorbs the gap later

- **Status:** Accepted
- **Deciders:** Fieldstate Dev Lead
- **Decided:** 2026-08-02
- **Format note:** authored as a **markdown ADR**, not a `*.decision.yaml`, per the repo's
  decision-format rule ([`docs/decisions/workspec-tech-spec-v0.1.md`](../../decisions/workspec-tech-spec-v0.1.md)
  §6): the costed format fits when every compared option carries a positive, graded cost/effort;
  this is a scope/constraint-driven call ratified directly in the epic body, not a weighted cost
  comparison. Ratified in [Epic #116](https://github.com/FieldstateNZ/workspec-studio/issues/116)
  as decision **E**; recorded per [D0 #123](https://github.com/FieldstateNZ/workspec-studio/issues/123).

## Context

The ported canvas code reads CSS custom properties that `@workspec/design` (the shared design
token package, maintained in an external repo) does not yet publish: `--sticky-*`,
`--canvas-grid-*`, `--agent`, and canvas keyframes. The epic flags silent visual degradation from
missing CSS vars as top risk #2 — an unresolved `var(--*)` silently falls back or renders nothing,
which a token-audit test and component screenshot goldens are meant to catch from day one. The
question is what to do about the specific token gaps that exist today, given `@workspec/design`
is out of this sprint's control (a separate, external repo).

## Options considered

- **Ship a documented, test-scoped local-token exemption in v1** (chosen). The missing tokens are
  defined locally (scoped to the packages/tests that need them), explicitly documented as an
  exemption list, and covered by the token-audit test alongside every other `var(--*)` read so the
  exemption is visible and enforced rather than silent. `@workspec/design` absorbing these tokens
  is tracked as a Brett action / follow-up issue, not a blocker.
- **Block v1 until `@workspec/design` ships the missing tokens.** Rejected: `@workspec/design` is
  an external repo outside this sprint's control, so this would make the canvas extraction's
  timeline depend on a release this team does not own or schedule, for a gap (styling tokens) that
  does not affect functional parity.

## Decision

The v1 canvas extraction ships with a documented, test-scoped local-token exemption covering
`--sticky-*`, `--canvas-grid-*`, `--agent`, and the canvas keyframes. The token-audit test treats
this exemption list as the only allowed gap — every other `var(--*)` read in ported code must
resolve under `@workspec/design`'s themes. Migrating these tokens into `@workspec/design` is a
tracked follow-up (Brett action), not part of this sprint.

## Consequences

- **+** v1 is not blocked on an external repo's release cadence.
- **+** The gap is explicit and enforced (an exemption list the token-audit test checks against),
  not a silent missing-variable failure mode — directly addressing top risk #2.
- **−** Local tokens are, by construction, a second source of truth for those specific values until
  `@workspec/design` absorbs them; they must be kept visually consistent by hand in the meantime.
- **−** The exemption list itself becomes a piece of tech debt with an owner (Brett, via the
  `@workspec/design` follow-up issue) and needs to be revisited so it does not become permanent by
  default.
