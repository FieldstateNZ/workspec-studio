# C — Zustand v5 for the store factory rewrite

- **Status:** Accepted
- **Deciders:** Fieldstate Dev Lead
- **Decided:** 2026-08-02
- **Format note:** authored as a **markdown ADR**, not a `*.decision.yaml`, per the repo's
  decision-format rule ([`docs/decisions/workspec-tech-spec-v0.1.md`](../../decisions/workspec-tech-spec-v0.1.md)
  §6): the costed format fits when every compared option carries a positive, graded cost/effort;
  this is a scope/constraint-driven call ratified directly in the epic body, not a weighted cost
  comparison. Ratified in [Epic #116](https://github.com/FieldstateNZ/workspec-studio/issues/116)
  as decision **C**; recorded per [D0 #123](https://github.com/FieldstateNZ/workspec-studio/issues/123).

## Context

The enterprise canvas engine's state is currently a **module singleton**: one zustand store per
process, shared implicitly by every consumer. That does not work for an OSS package that may be
mounted multiple times in one page (studio + host, or multiple canvases), so `@workspec/canvas`
ships a **store factory** (a zustand vanilla store + a context provider) instead of a singleton.
This is a from-scratch rewrite of the store construction path — touching roughly 70 internal call
sites plus 18 enterprise `useCanvasStore` sites (top risk #1 in the epic) — which makes the
zustand major version a live question at rewrite time rather than an untouched inherited pin.

## Options considered

- **Zustand v5, adopted during the rewrite** (chosen). Since the singleton→factory rewrite already
  touches every store construction and consumption site, it is the natural point to move onto the
  current major rather than freezing whatever version the enterprise singleton happened to be
  pinned to.
- **Keep the enterprise's existing zustand version.** Rejected as the default: carrying an older
  major forward into a brand-new store factory would mean re-doing the version bump later, on a
  now-published OSS package with external consumers, instead of once during the rewrite while the
  call signature is already being re-verified end to end.

## Decision

The store factory in `@workspec/canvas` is built on **zustand v5**. The rewrite is guarded by
contract tests that preserve the `useCanvasStore(selector)` call signature exactly, so the version
bump and the singleton→factory change land together without changing how consumers read state.

## Consequences

- **+** No second migration later: the OSS package starts on the current major instead of
  inheriting technical debt from the enterprise singleton.
- **+** The rewrite's own verification burden (mechanical codemod across ~70 internal + 18
  enterprise call sites, preserving `useCanvasStore(selector)`) already covers the version bump —
  there is no separate migration pass to schedule.
- **−** Widens the blast radius of an already-large mechanical change: any v4→v5 API differences
  compound with the singleton→factory rewrite in the same PR, rather than being isolated and
  independently revertible.
- **−** The enterprise re-adoption spike (S6) must reconcile whatever zustand version the
  enterprise repo is actually on with v5 in the ported package; this is exactly the kind of gap the
  spike (report + draft diff, nothing merged) is scoped to surface rather than resolve.
