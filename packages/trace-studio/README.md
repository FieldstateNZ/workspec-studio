# @workspec/trace-studio

The `workspec-trace` CLI for the WorkSpec Traceability Workbench — **shippable value, zero
frontend** (spec §6/§8, the T4 milestone). It emits test files from system-requirements (Gherkin
Rules) + their scenarios, ingests a test toolchain's results as evidence keyed on the scenario
slug, **verifies** scenario coverage, userReq coverage, and pass-rate as a build-breaking CI gate,
and **exports the RTM** — the requirements traceability matrix, the compliance payload (spec §5/§6,
the T6 milestone) — as a byte-deterministic `matrix.md` / `matrix.csv` / `matrix.html` artifact.
Mirrors `@workspec/cost-studio`'s shape: a thin, testable `run(argv, io, deps)` core over an
injectable filesystem repository port, with `bin.ts` as the only file that touches `process`
directly. A standalone localhost host shell (`/traceability`) lands in **T8**.

## The model (spec §4)

Five file-native kinds: **actor**, **feature**, **user-requirement** (the promise), **system-
requirement** (a Gherkin **Rule** — groups scenarios, verifies userReqs, has no steps of its own),
and **scenario** (the fifth kind: the executed unit, carrying `given`/`when`/`then` and referencing
its parent Rule via `systemRequirement`). Evidence (`.runs/*.json`) keys on the **scenario** slug.

## Commands

```sh
# Greenfield: Rules (system-requirements) + their scenarios -> test files
# (one .feature file per Rule; the only command that writes test files)
workspec-trace emit --emitter cucumber [--feature <slug>] [--out <dir>] [--dir <root>] [--json]

# Brownfield: a test toolchain's results -> a run (evidence, keyed on scenario slug)
workspec-trace ingest <results-file> --emitter cucumber [--id <id>] [--ts <iso>] \
                      [--sha <sha>] [--ci <ci>] [--dir <root>] [--runs-dir <dir>] [--json]

# The CI gate — three meters, never collapsed
workspec-trace verify [--min-scenario-coverage <0..1>] [--min-userreq-coverage <0..1>] \
                      [--min-pass-rate <0..1>] [--dir <root>] [--runs-dir <dir>] [--json]

# The RTM export — the compliance artifact (spec §5/§6)
workspec-trace matrix [--out <file>] [--format md|csv|html] [--dir <root>] [--runs-dir <dir>]
```

`--dir` roots the working tree (default: cwd); artifacts are read from `.workspec/` under it.
`emit --feature <slug>` filters **Rules** by `spec.feature`; only their scenarios are emitted.

### `verify` — the gate

`verify` loads `.workspec/`, derives the trace model (`@workspec/trace-model`) — **scenario
coverage**, **userReq coverage**, and **pass rate** (spec §4.7/§5) — and **fails (exit 1)** on any
of:

- a loader validation issue (invalid YAML / schema violation / bad filename), OR
- an **error**-severity finding — a dangling intra-tree ref or a duplicate slug (spec §4.7), which
  **always** gate regardless of thresholds, OR
- scenario coverage below `--min-scenario-coverage`, OR
- userReq coverage below `--min-userreq-coverage`, OR
- pass-rate below `--min-pass-rate`.

Thresholds are **opt-in** (default `0` → no floor). All three meters are always shown side by side
as "N of M (P%)" — never collapsed to a single number (spec §5): 100% pass over 40% coverage is the
lie every test dashboard tells. A Rule with no scenarios surfaces as an `empty-rule` warning
finding — a requirement with no proof at all. v0 uses **absolute** thresholds;
regression-vs-baseline is v0.1 (spec §9.4). `--json` emits the machine-readable model summary
(three meters + findings + verdict) for CI.

| Exit code | Meaning                                         |
| --------- | ----------------------------------------------- |
| `0`       | pass                                            |
| `1`       | gate failed (verify) or a runtime error         |
| `2`       | usage error (unknown command/flag, missing arg) |

### `matrix` — the RTM export

`matrix` loads `.workspec/`, derives the trace model, and projects it to the **requirements
traceability matrix** — the compliance artifact a regulated user adopts this module for (spec
§5/§6). One row per **scenario** (the executed unit):

| Column     | What it shows                                                        |
| ---------- | -------------------------------------------------------------------- |
| `Feature`  | The scenario's Rule's containing feature name.                       |
| `Rule`     | The Rule's (system-requirement's) title.                             |
| `Scenario` | The scenario's title.                                                |
| `Verifies` | The userReq title(s) the Rule verifies, `"; "`-joined.               |
| `Status`   | Latest-run proof: `pass` \| `fail` \| `skip` \| `unproven`.          |
| `Run`      | The latest run's id that proved the scenario (empty when unproven).  |
| `SHA`      | That run's commit SHA (empty when unproven or the run carried none). |

An **empty Rule** (no scenarios at all — spec §4.7's "a requirement with no proof") contributes one
synthetic placeholder row of its own (`Status: unproven`, no `Run`/`SHA`), since it has no scenario
row to appear on otherwise. A **dangling** scenario -> Rule ref, or Rule -> feature ref, is still
listed — the ref is shown **as-authored** (spec §4.8), never silently dropped.

Rows are ordered by feature slug, then Rule slug, then scenario slug, so the artifact is
**byte-stable and CI-diffable** — identical input always yields an identical file, in every format:

- **`--out matrix.md`** (or `--format md`): a GitHub-flavoured Markdown table. Pipes are escaped
  (`\|`); embedded newlines fold to `<br>`.
- **`--out matrix.csv`** (or `--format csv`): RFC 4180 CSV. A field is quoted, with embedded quotes
  doubled, iff it contains a comma, a quote, or a newline.
- **`--out matrix.html`** (or `--format html`): a **self-contained** HTML document — inline
  `<style>`, no external stylesheet/script/font references — so it opens standalone in a browser
  straight off disk. `< > & "` are escaped.

The format is **inferred from `--out`'s extension** (`.md`/`.markdown` → md, `.csv` → csv,
`.html`/`.htm` → html); `--format` **overrides** whatever the extension would imply, and an
unrecognised `--format` value is a usage error rather than a silent fall-through. Omit `--out` to
print the rendered artifact to stdout instead of writing a file. Exit codes: `0` success, `1` write
failure, `2` usage error (bad/unknown format, missing arg).

The pure `TraceModel -> MatrixRow[]` projection (`buildMatrixRows`) and the three renderers
(`renderMatrixMarkdown`/`renderMatrixCsv`/`renderMatrixHtml`, or `renderMatrix(format, rows)`) are
also exported from the package's public surface — no IO, so an embedder (a future Matrix-view
export button, spec §5) can reuse the same projection the CLI wires up.

### Evidence (`.runs/`)

`ingest` writes each run to `<runs-dir>/<id>.json` (default `.workspec/.runs`, configurable via
`--runs-dir`). The runs dir is **gitignore-able** (spec §9.3); commit it to keep an auditable
proof-history. The run `id`/`ts` default to the wall clock (`--ts`/`--id` override); the derived id
is a filesystem-safe timestamp stem (e.g. `2026-07-09T02-14-07Z`). v0 is latest-run-only (spec
§9.4).

## Scripts

| Script                                           | Does                                                                        |
| ------------------------------------------------ | --------------------------------------------------------------------------- |
| `pnpm --filter @workspec/trace-studio build`     | tsc + tsup → `dist/` (ESM + `.d.ts`), incl. the `workspec-trace` executable |
| `pnpm --filter @workspec/trace-studio typecheck` | `tsc -b` (self-bootstraps sibling deps from source)                         |
| `pnpm --filter @workspec/trace-studio test`      | vitest                                                                      |
| `pnpm --filter @workspec/trace-studio lint`      | eslint                                                                      |
