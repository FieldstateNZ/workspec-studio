# D3 — Levers are declarative patches, not code

- **Status:** Accepted
- **Deciders:** Fieldstate Dev Lead
- **Decided:** 2026-07-01
- **Format note:** authored as a **markdown ADR**. The deciding factor is a hard constraint
  (YAML cannot hold functions) plus safety — not a graded cost trade-off — so prose fits better
  than a costed `*.decision.yaml`.

## Context

The design prototype expressed each optimisation lever as JavaScript: `lever.match = (l) => …`
and `lever.apply = (l) => …`. Decisions must persist as plain, reviewable YAML in the working
tree. Functions cannot live in YAML, and even if they could, executing author-supplied code
from a repo the tool opens would be an unacceptable execution-of-untrusted-code risk.

## Options considered

- **Declarative patch ops** (chosen). A lever is an ordered list of ops; each op has a `match`
  (by `tags` / `groups` / `ids`, optionally scoped by `envs`) and a `set`
  (`mode` / `schedule` / `qtyScale`) and/or `addLines`. The engine ships the interpreter;
  `enabled: false` is a no-op. Designed against all five prototype levers before coding.
- **An embedded expression language** (CEL / JSONLogic). More expressive than the patch grammar,
  but a much larger normative surface to specify and hold stable across a Rust CLI and
  Enterprise — and still overkill for the five levers that exist.
- **Sandboxed JS plugins.** Restores full expressiveness but reintroduces the execution risk and
  is impossible to render/diff as data.

## Decision

Levers are declarative data interpreted by the engine. The patch grammar
(`match` / `set` / `addLines`) covers every prototype lever; anything it cannot express is a
signal to add a narrow, normative op rather than to embed logic. `set.mode` / `set.schedule`
apply to SKU lines only (a no-op on flat lines), matching the prototype's behaviour.

## Consequences

- **+** Levers are plain, diffable, reviewable YAML — no code executes from an opened repo.
- **+** The grammar is small and snapshot-lockable; a conforming Rust/Enterprise engine can match it.
- **+** `match.envs` scopes `qtyScale`; per-env mode/schedule differences are modelled as
  separate lines (see the postgres example), keeping the line model simple.
- **−** Less expressive than arbitrary code; genuinely novel transforms need a schema change, not
  a user-authored function. This is an accepted, deliberate ceiling.
