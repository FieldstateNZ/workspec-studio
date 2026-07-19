# @workspec/trace-model

The pure, normative traceability engine for the WorkSpec Traceability Workbench. Mirrors
`@workspec/cost-engine`'s shape: no IO, no DOM, no React — a library of pure functions over
`@workspec/req-schema` artifacts. The only runtime dependency is `@workspec/req-schema`.

## What it does

`buildModel(tree, runs) → TraceModel` DERIVES (never stores, per
[`docs/traceability/spec.md`](../../docs/traceability/spec.md) §4.7) the traceability graph from a
single tree of located artifacts plus its ingested test runs. It is deterministic (every output
array is sorted) and never throws — every problem surfaces as a structured `Finding`.

The model is the 5-kind Gherkin **Rule** model (§4.4–§4.6): a `SystemRequirement` **is a Rule** —
`{ title, feature, userReqs[] }`, no steps of its own — that groups **scenarios** (the fifth,
file-native kind). A `Scenario` is the executed unit: `{ title, systemRequirement, given?, when?,
then, examples? }`. Evidence keys on the **scenario** slug, not the Rule's.

- **Evidence join** — each scenario gets its latest-run verdict, keyed on the scenario slug alone
  (§4.6). `pass` / `fail` / `skip` / **absence** are four distinct states; absence in the latest
  run → **unproven**.
- **`ruleProven`** (§4.7, the strict reading) — a Rule counts as proven only when it has **≥1
  scenario AND every one of them is `pass`** in the latest run. A Rule with zero scenarios is
  `empty` (a requirement with no proof at all) and is never `ruleProven`.
- **Three meters, never collapsed** (§5):
  - **`scenarioCoverage`** = scenarios with a result in the latest run ÷ all scenarios.
  - **`userReqCoverage`** = userReqs with ≥1 `ruleProven` verifying Rule ÷ all userReqs.
  - **`passRate`** = passing scenarios ÷ scenarios **with evidence** in the latest run (`skip`
    counts as evidence).
  - All three exposed as `{ numerator, denominator, ratio }`, so a UI can show "N of M".
- **Findings** (data, not thrown): `orphan-user-requirement` (the headline — a promise no Rule
  verifies), `orphan-feature`, `empty-rule` (a Rule with no scenarios), `dangling-ref` (bare-slug
  intra-tree refs that don't resolve — §4.7, including `scenario.systemRequirement` → sysreqs;
  cross-layer `links` are never checked), `duplicate-slug` (now covering all five kinds, including
  scenarios).

The engine is **pure**: the caller (the T4 CLI/loader) reads files and hands each artifact in as a
`Located<A>` — `{ slug, artifact, source: { file, line? } }` — so findings can point at source.

## Scripts

| Script                                          | Does                                  |
| ----------------------------------------------- | ------------------------------------- |
| `pnpm --filter @workspec/trace-model build`     | tsc + tsup → `dist/` (ESM + `.d.ts`)  |
| `pnpm --filter @workspec/trace-model typecheck` | `tsc -b` (self-bootstraps req-schema) |
| `pnpm --filter @workspec/trace-model test`      | vitest (unit + golden snapshot)       |
| `pnpm --filter @workspec/trace-model lint`      | eslint                                |
