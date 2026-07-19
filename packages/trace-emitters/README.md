# @workspec/trace-emitters

The emit + ingest **seam** for the WorkSpec Traceability Workbench. A system-requirement **is a
Gherkin Rule** — it groups scenarios and carries no steps of its own; a scenario is the fifth,
file-native kind and the **executed unit** (spec §4.4/§4.5). An emitter is a named convention
binding Rule + scenario artifacts to a test toolchain **in both directions**: `emit(rules) →
files` (greenfield) and `ingest(raw, meta) → TestRun` (brownfield), plus its declared
conventions. This is the module's provider seam — adding a framework means adding an `Emitter` and
nothing else. Pure and deterministic: no IO, no DOM, no clock; identical input yields byte-identical
output.

Ships **`cucumber`** (emit → `.feature` files) and **`junit`** (emit → JUnit XML files) — see
[`docs/traceability/spec.md`](../../docs/traceability/spec.md) §3/§7. `junit` is the seam's second
provider, added with ZERO changes to `types.ts`/`registry.ts`'s contract shape (only a new entry in
the `emitters` array) — proof the seam generalises.

## The `Emitter` contract

```ts
interface Emitter {
  readonly name: string; // 'cucumber' | 'junit' — becomes TestRun.emitter on ingest
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

## The four junit conventions (spec §3)

JUnit XML has no native way to tag a testcase with a requirement id, and — unlike a Gherkin
`.feature` file — no native "outline" construct either. `junit` designs its own binding for both:

| Convention                  | Honoured by                                                                                                                                                                                                     |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `testsuite-file-per-rule`   | one JUnit XML file per Rule, named `<sysreq-slug>.xml`                                                                                                                                                          |
| `rule-groups-testcases`     | the file is one `<testsuite>` per Rule, one `<testcase>` per scenario, `classname` = Rule slug                                                                                                                  |
| `req-slug-as-testcase-name` | each testcase's `name` attribute IS the scenario slug verbatim — the binding `ingest` keys back on                                                                                                              |
| `outline-row-fold`          | an examples-table scenario still emits ONE testcase; a run may report one execution per row, all sharing that `name` — ingest folds them (`fail` > `skip` > `pass`), same precedence as cucumber's outline rows |

`ingest`'s `raw` is expected to be the report's raw XML **string** (unlike cucumber's already-parsed
JSON array) — this package ships no XML-parsing dependency, so `junit.ts` parses defensively with
its own regex-based scan: a non-string `raw`, or a `<testcase>` with no recoverable `name`, is
skipped rather than fatal (mirrors how cucumber ignores an untagged `Background`/scenario). A
`<failure>`/`<error>` child → `fail`; a `<skipped>` child → `skip`; otherwise (including the
standard self-closing `<testcase .../>` most tools emit for a clean pass) → `pass`. The scenario's
human title is carried in a companion `<properties><property name="title" value="…"/></properties>`
for readability only — never load-bearing. All five XML-significant characters (`&`, `<`, `>`, `"`,
`'`) are escaped on emit and reversed on ingest (`xml-escape.ts`).

## Round-trip conformance (issue #71)

_"An emitter that can't round-trip is broken by definition."_ `assertRoundTrip` runs the loop —
**emit → mock run → ingest → derive** — and proves the same scenarios come out proven (the scenario
is the executed unit, so conformance is judged per-scenario). "Proven" is made semantic through
`@workspec/trace-model`'s `buildModel`: it asserts `ScenarioNode.proof === 'pass'`, the same
judgement the meters and UI make. The harness itself (`conformance.ts`) is emitter-AGNOSTIC — both
`cucumber` and `junit` run through the exact same `roundTrip`/`assertRoundTrip`, each supplying only
its own `Emitter` + mock runner.

```ts
import { cucumberEmitter, mockCucumberRun, assertRoundTrip } from '@workspec/trace-emitters';

assertRoundTrip(cucumberEmitter, tree, mockCucumberRun, meta); // throws if any scenario unproven

import { junitEmitter, mockJunitRun } from '@workspec/trace-emitters';

assertRoundTrip(junitEmitter, tree, mockJunitRun, meta); // same harness, second provider
```

## Scripts

| Script                                             | Does                                 |
| -------------------------------------------------- | ------------------------------------ |
| `pnpm --filter @workspec/trace-emitters build`     | tsc + tsup → `dist/` (ESM + `.d.ts`) |
| `pnpm --filter @workspec/trace-emitters typecheck` | `tsc -b` (self-bootstraps deps)      |
| `pnpm --filter @workspec/trace-emitters test`      | vitest                               |
