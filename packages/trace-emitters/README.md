# @workspec/trace-emitters

The emit + ingest **seam** for the WorkSpec Traceability Workbench. A system-requirement **is a
Gherkin Rule** — it groups scenarios and carries no steps of its own; a scenario is the fifth,
file-native kind and the **executed unit** (spec §4.4/§4.5). An emitter is a named convention
binding Rule + scenario artifacts to a test toolchain **in both directions**: `emit(rules) →
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
  emit(rules: readonly RuleWithScenarios[]): EmittedFile[]; // pure descriptors, no disk write
  ingest(raw: unknown, meta: RunMeta): TestRun; // defensive, never throws
}
```

`RuleWithScenarios = { sysreq: RuleInput, scenarios: readonly ScenarioInput[] }` pairs each Rule
with the scenarios it groups; `RuleInput = { slug, artifact }` and `ScenarioInput = { slug,
artifact }` each carry their **loader-derived slug** (the filename stem is the identity, per spec
§4 — `metadata.slug` is optional). `EmittedFile = { path, content }` — the T4 CLI writes these.
`RunMeta = { id, ts, sha?, ci? }` — the caller supplies run identity/timestamp; the emitter has no
clock.

## The four cucumber conventions (spec §3)

| Convention              | Honoured by                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------ |
| `feature-file-per-rule` | one `.feature` file per Rule, named `<sysreq-slug>.feature`                          |
| `rule-groups-scenarios` | the file is `Feature:` › `Rule:` › one `Scenario:`/`Scenario Outline:` per scenario  |
| `req-tag-on-scenario`   | each scenario carries its OWN `@<scenario-slug>` — the binding `ingest` keys back on |
| `outline-from-examples` | a scenario with an `examples` table → `Scenario Outline` + table                     |

## Round-trip conformance (issue #71)

_"An emitter that can't round-trip is broken by definition."_ `assertRoundTrip` runs the loop —
**emit → mock run → ingest → derive** — and proves the same scenarios come out proven (the scenario
is the executed unit, so conformance is judged per-scenario). "Proven" is made semantic through
`@workspec/trace-model`'s `buildModel`: it asserts `ScenarioNode.proof === 'pass'`, the same
judgement the meters and UI make.

```ts
import { cucumberEmitter, mockCucumberRun, assertRoundTrip } from '@workspec/trace-emitters';

assertRoundTrip(cucumberEmitter, tree, mockCucumberRun, meta); // throws if any scenario unproven
```

## Scripts

| Script                                             | Does                                 |
| -------------------------------------------------- | ------------------------------------ |
| `pnpm --filter @workspec/trace-emitters build`     | tsc + tsup → `dist/` (ESM + `.d.ts`) |
| `pnpm --filter @workspec/trace-emitters typecheck` | `tsc -b` (self-bootstraps deps)      |
| `pnpm --filter @workspec/trace-emitters test`      | vitest                               |
