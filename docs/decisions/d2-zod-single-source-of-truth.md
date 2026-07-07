# D2 — Zod as the single source of truth

- **Status:** Accepted
- **Deciders:** Fieldstate Dev Lead
- **Decided:** 2026-07-01
- **Format note:** authored as a **markdown ADR**, not a `*.decision.yaml`. This is a
  design-correctness decision, not a resource trade-off — the deciding factor is "one
  definition yields three always-in-sync outputs," which the costed decision format (options
  with per-env dollar costs) does not usefully model. See
  [`workspec-tech-spec-v0.1.md`](../workspec-tech-spec-v0.1.md) §D-decisions for why D2/D3/D6
  are prose and D1/D4/D5 are dogfooded YAML.

## Context

The schema layer must produce three artifacts that can never disagree: TypeScript types
(compile-time), runtime validation with YAML line/column mapping (the CLI + host), and JSON
Schema draft 2020-12 (editor IntelliSense via the `yaml-language-server` directive). If these
come from separate definitions they drift, and the schema is normative — a future Rust CLI and
WorkSpec Enterprise must agree on it.

## Options considered

- **Zod as the source, deriving the rest** (chosen). One `z.object` tree with `.describe()` on
  every field; `z.infer` gives types, `safeParse` gives validation, `zod-to-json-schema` gives
  the committed `json-schema/`. A CI drift check regenerates the JSON Schema and fails if it
  differs from what is committed.
- **Hand-written TS types + a JSON Schema + ajv.** Three sources, three chances to drift, no
  single place the `.describe()` hover docs live.
- **TypeBox** (JSON-Schema-first, types inferred). Strong, but its runtime-error ergonomics and
  YAML line/col mapping are weaker than Zod's `superRefine`, and the team's fluency is in Zod.
- **io-ts.** Powerful but a heavier functional API for contributors than Zod.

## Decision

Zod is the single source of truth. Every field carries a `.describe()` that becomes both the
JSON Schema `description` (editor hover) and the human doc. Cross-field integrity (option envs ⊆
decision envs, dangling env keys, score keys ⊆ criteria, `outcome.option` exists) lives in one
`superRefine`. The generated JSON Schema is committed and drift-checked in CI.

## Consequences

- **+** One edit updates types, validation, and IntelliSense together — they cannot drift.
- **+** `.describe()` gives editor completion + hover for free from the same text.
- **+** The drift check makes the committed JSON Schema a reviewable artifact.
- **−** We are coupled to Zod's JSON-Schema emitter; exotic Zod constructs that don't translate
  cleanly are avoided (the schema stays deliberately plain).
