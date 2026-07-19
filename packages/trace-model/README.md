# @workspec/trace-model

The pure, normative traceability engine for the WorkSpec Traceability Workbench. Mirrors
`@workspec/cost-engine`'s shape: no IO, no DOM, no React — a library of pure functions over
`@workspec/req-schema` artifacts. The only runtime dependency is `@workspec/req-schema`.

## What it does

`buildModel(tree, runs) → TraceModel` DERIVES (never stores, per
[`docs/traceability/spec.md`](../../docs/traceability/spec.md) §4.6) the traceability graph from a
single tree of located artifacts plus its ingested test runs. It is deterministic (every output
array is sorted) and never throws — every problem surfaces as a structured `Finding`.

- **Evidence join** — each system-requirement gets its latest-run verdict, keyed on the sysreq slug
  alone (§4.5). `pass` / `fail` / `skip` / **absence** are four distinct states; absence in the
  latest run → **unproven**.
- **Two meters, never collapsed** (§5):
  - **Coverage** = userReqs with ≥1 **passing** verifying sysreq ÷ all userReqs (userReq-centric —
    surfaces the orphan-userReq finding).
  - **Pass rate** = passing sysreqs ÷ sysreqs **with evidence** in the latest run (sysreq-centric).
  - Both exposed as `{ numerator, denominator, ratio }`, so a UI can show "N of M".
- **Findings** (data, not thrown): `orphan-user-requirement` (the headline — a promise no test
  proves), `orphan-feature`, `dangling-ref` (bare-slug intra-tree refs that don't resolve — §4.7;
  cross-layer `links` are never checked), `duplicate-slug`.

The engine is **pure**: the caller (the T4 CLI/loader) reads files and hands each artifact in as a
`Located<A>` — `{ slug, artifact, source: { file, line? } }` — so findings can point at source.

## Scripts

| Script                                          | Does                                  |
| ----------------------------------------------- | ------------------------------------- |
| `pnpm --filter @workspec/trace-model build`     | tsc + tsup → `dist/` (ESM + `.d.ts`)  |
| `pnpm --filter @workspec/trace-model typecheck` | `tsc -b` (self-bootstraps req-schema) |
| `pnpm --filter @workspec/trace-model test`      | vitest (unit + golden snapshot)       |
| `pnpm --filter @workspec/trace-model lint`      | eslint                                |
