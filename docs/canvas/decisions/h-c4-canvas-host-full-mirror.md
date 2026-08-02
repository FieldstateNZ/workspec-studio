# H — `C4CanvasHost` mirrors the full enterprise bridge, everything optional

- **Status:** Accepted
- **Deciders:** Fieldstate Dev Lead
- **Decided:** 2026-08-02
- **Format note:** authored as a **markdown ADR**, not a `*.decision.yaml`, per the repo's
  decision-format rule ([`docs/decisions/workspec-tech-spec-v0.1.md`](../../decisions/workspec-tech-spec-v0.1.md)
  §6): the costed format fits when every compared option carries a positive, graded cost/effort;
  this is a scope/constraint-driven call ratified directly in the epic body, not a weighted cost
  comparison. Ratified in [Epic #116](https://github.com/FieldstateNZ/workspec-studio/issues/116)
  as decision **H**; recorded per [D0 #123](https://github.com/FieldstateNZ/workspec-studio/issues/123).

## Context

`@workspec/canvas` defines the `CanvasHost` seam that lets a host application hook into canvas
behaviour. `C4CanvasHost` is the C4-specific bridge implementation that ships in
`@workspec/canvas-c4`. The enterprise canvas's own bridge is a 12-method contract, including a
couple of enterprise-only oddities (`enterRoom`, `toggleReworking`) that have no meaning for the
OSS studio. The question is whether the OSS `C4CanvasHost` mirrors that full contract or ships a
trimmed-down one scoped to what the OSS studio actually calls today.

## Options considered

- **Mirror the full 12-method enterprise bridge, all methods optional** (chosen). Every method the
  enterprise bridge exposes exists on `C4CanvasHost`, but all of them are optional, and a `false`
  return (or omission) falls back to the existing local-undoable behaviour — the "false→
  local-undoable-fallback" semantics are preserved exactly as in the enterprise contract.
  Enterprise-only methods (`enterRoom`, `toggleReworking`) exist on the interface as optional
  callbacks that the OSS studio simply never installs.
- **A minimal bridge scoped to what the OSS studio calls today**, omitting methods the OSS studio
  has no current use for (including but not limited to `enterRoom`/`toggleReworking`). Rejected:
  this is exactly the gap the S6 enterprise re-adoption spike exists to avoid discovering late —
  if the OSS bridge's shape doesn't match the enterprise one, re-adopting the shared package back
  into enterprise means widening the interface (and re-verifying every existing enterprise call
  site) at that point instead of now, while the full contract is already being ported and tested.

## Decision

`C4CanvasHost` mirrors the enterprise bridge's full 12-method contract, with every method
optional and the enterprise's `false→local-undoable-fallback` semantics preserved. Enterprise-only
callbacks (`enterRoom`, `toggleReworking`) are part of the type but are optional callbacks the OSS
studio never installs.

## Consequences

- **+** The S6 enterprise re-adoption spike compares like-for-like: the ported bridge's shape
  already matches what enterprise code expects, so the spike's report/draft diff is about
  behaviour, not about interface gaps that would need a separate widening pass.
- **+** Because every method is optional with a local-undoable fallback, the OSS studio can adopt
  `C4CanvasHost` today while installing none of the enterprise-only callbacks, with no behavioural
  difference from a purpose-built minimal bridge.
- **−** `C4CanvasHost`'s public type surface carries methods (`enterRoom`, `toggleReworking`) that
  are meaningless outside enterprise and could read as dead surface to an OSS-only consumer
  without the context of why they exist.
- **−** Preserving "false→local-undoable-fallback" semantics exactly means porting that fallback
  logic faithfully for every one of the 12 methods, not just the ones the OSS studio currently
  exercises — more to port and contract-test than a trimmed bridge would need.
