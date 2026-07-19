# @workspec/trace-emitters

The emit + ingest **seam** for the WorkSpec Traceability Workbench. An emitter is a named convention
binding system-requirement artifacts to a test toolchain **in both directions**: `emit(sysreqs) →
.feature files` (greenfield) and `ingest(raw, meta) → TestRun` (brownfield), plus its declared
conventions. This is the module's provider seam — adding a framework means adding an `Emitter` and
nothing else. Pure and deterministic: no IO, no DOM, no clock; identical input yields byte-identical
output.

Ships the **`cucumber`** emitter (junit follows in a later slice — see
[`docs/traceability/spec.md`](../../docs/traceability/spec.md) §3/§7).

## The `Emitter` contract

```ts
interface Emitter {
  readonly name: string; // 'cucumber' — becomes TestRun.emitter on ingest
  readonly conventions: readonly EmitterConvention[];
  emit(sysreqs: readonly SysReqInput[]): EmittedFile[]; // pure descriptors, no disk write
  ingest(raw: unknown, meta: RunMeta): TestRun; // defensive, never throws
}
```

`SysReqInput = { slug, sysreq }` pairs each system-requirement with its **loader-derived slug** (the
filename stem is the identity, per spec §4 — `metadata.slug` is optional). `EmittedFile = { path,
content }` — the T4 CLI writes these. `RunMeta = { id, ts, sha?, ci? }` — the caller supplies run
identity/timestamp; the emitter has no clock.

## The three cucumber conventions (spec §3)

| Convention                | Honoured by                                                        |
| ------------------------- | ------------------------------------------------------------------ |
| `feature-file-per-sysreq` | one `.feature` file per sysreq, named `<slug>.feature`             |
| `req-tag-on-scenario`     | the scenario carries `@<slug>` — the binding `ingest` keys back on |
| `outline-from-examples`   | a sysreq with an `examples` table → `Scenario Outline` + table     |

## Round-trip conformance (issue #71)

_"An emitter that can't round-trip is broken by definition."_ `assertRoundTrip` runs the loop —
**emit → mock run → ingest → derive** — and proves the same sysreqs come out proven. "Proven" is
made semantic through `@workspec/trace-model`'s `buildModel`: it asserts `proof === 'pass'`, the same
judgement the meters and UI make.

```ts
import { cucumberEmitter, mockCucumberRun, assertRoundTrip } from '@workspec/trace-emitters';

assertRoundTrip(cucumberEmitter, tree, mockCucumberRun, meta); // throws if any sysreq unproven
```

## Scripts

| Script                                             | Does                                 |
| -------------------------------------------------- | ------------------------------------ |
| `pnpm --filter @workspec/trace-emitters build`     | tsc + tsup → `dist/` (ESM + `.d.ts`) |
| `pnpm --filter @workspec/trace-emitters typecheck` | `tsc -b` (self-bootstraps deps)      |
| `pnpm --filter @workspec/trace-emitters test`      | vitest                               |
