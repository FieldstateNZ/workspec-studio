# @workspec/trace-studio

The `workspec-trace` CLI for the WorkSpec Traceability Workbench — **shippable value, zero
frontend** (spec §6/§8, the T4 milestone). It emits test files from system-requirements, ingests a
test toolchain's results as evidence, and **verifies** requirement coverage + pass-rate as a
build-breaking CI gate. Mirrors `@workspec/cost-studio`'s shape: a thin, testable `run(argv, io,
deps)` core over an injectable filesystem repository port, with `bin.ts` as the only file that
touches `process` directly. A standalone localhost host shell (`/traceability`) lands in **T8**.

## Commands

```sh
# Greenfield: system-requirements -> test files (the only command that writes test files)
workspec-trace emit --emitter cucumber [--feature <slug>] [--out <dir>] [--dir <root>] [--json]

# Brownfield: a test toolchain's results -> a run (evidence)
workspec-trace ingest <results-file> --emitter cucumber [--id <id>] [--ts <iso>] \
                      [--sha <sha>] [--ci <ci>] [--dir <root>] [--runs-dir <dir>] [--json]

# The CI gate
workspec-trace verify [--min-coverage <0..1>] [--min-pass-rate <0..1>] \
                      [--dir <root>] [--runs-dir <dir>] [--json]
```

`--dir` roots the working tree (default: cwd); artifacts are read from `.workspec/` under it.

### `verify` — the gate

`verify` loads `.workspec/`, derives the trace model (`@workspec/trace-model`), and **fails (exit 1)** on any of:

- a loader validation issue (invalid YAML / schema violation / bad filename), OR
- an **error**-severity finding — a dangling intra-tree ref or a duplicate slug (spec §4.7), which
  **always** gate regardless of thresholds, OR
- coverage below `--min-coverage`, OR
- pass-rate below `--min-pass-rate`.

Thresholds are **opt-in** (default `0` → no floor). Both meters are always shown side by side as
"N of M (P%)" — never collapsed to a single number (spec §5). v0 uses **absolute** thresholds;
regression-vs-baseline is v0.1 (spec §9.4). `--json` emits the machine-readable model summary
(meters + findings + verdict) for CI.

| Exit code | Meaning                                         |
| --------- | ----------------------------------------------- |
| `0`       | pass                                            |
| `1`       | gate failed (verify) or a runtime error         |
| `2`       | usage error (unknown command/flag, missing arg) |

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
