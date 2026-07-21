// The `workspec-trace` CLI — emit / ingest / verify / matrix / mcp over a
// working tree of traceability artifacts (spec §6). `emit`/`ingest`/`verify`
// were the T4 milestone (shippable value, zero frontend); `matrix` is T6's
// export half (spec §5/§6) — the RTM as a generated, byte-deterministic
// compliance artifact (md/csv/html); `mcp` (Step 4) exposes the same four
// operations to an MCP client/agent over stdio.
//
// `run(argv, io, deps)` is the testable entry point: it returns a process exit
// code and writes through an injectable `CliIO` (defaulting to the real
// streams), so tests drive it and capture output without spawning a process.
// `deps` injects a `repository` (the fs boundary) and a `clock` in place of the
// default `FsRepository`/wall-clock wiring, so ingest is deterministic under
// test. `bin.ts` is the ONLY thing that touches `process`.
//
// Each command's actual domain logic (repo loads/writes, emitter dispatch,
// the CI gate, the RTM projection) lives in its own `*-core.ts` module
// (`emit-core.ts`/`ingest-core.ts`/`verify-core.ts`/`matrix-core.ts`),
// shared with the `mcp` subcommand's tools (`mcp-tools/*.ts`) — this module
// stays CLI-arg-parsing and human/`--json` rendering only, mirroring how
// `@workspec/cost-studio` split its own commands in Step 2.
//
// Exit codes are the contract CI keys on: 0 = pass, 1 = gate failed (verify) or
// a write/runtime error (matrix/emit/ingest), 2 = usage error (unknown
// command/flag, missing arg, bad value). This CLI NEVER invokes git — the
// human commits.

import { parseArgs } from 'node:util';
import { EMITTER_NAMES, runEmitCore } from './emit-core.js';
import { formatLoadIssue } from './format-load-issue.js';
import { DEFAULT_RUNS_DIR, FsRepository } from './fs-repository.js';
import { runIngestCore, validateIngestArgs } from './ingest-core.js';
import { runMatrixCore } from './matrix-core.js';
import { resolveMatrixFormat } from './matrix-format.js';
import { runMcp } from './run-mcp.js';
import type { LoadIssue, TraceRepositoryPort } from './repository.js';
import { isValidThreshold, pct, runVerifyCore } from './verify-core.js';
import type { VerifyResult } from './verify-core.js';
import type { Finding, Meter } from '@workspec/trace-model';

/** Injectable IO. Primary command output goes to `out`; diagnostics/usage errors to `err`. */
export interface CliIO {
  out(text: string): void;
  err(text: string): void;
}

const defaultIO: CliIO = {
  out: (text) => process.stdout.write(text),
  err: (text) => process.stderr.write(text),
};

/**
 * Injectable dependencies, for tests. When omitted, each command builds its
 * own default: an `FsRepository` rooted at `--dir` (or cwd) and a real wall-clock
 * `clock` returning an ISO-8601 timestamp.
 */
export interface RunDeps {
  repository?: TraceRepositoryPort;
  clock?: () => string;
}

function resolveRepository(deps: RunDeps | undefined, dir: string): TraceRepositoryPort {
  return deps?.repository ?? new FsRepository(dir);
}

function resolveClock(deps: RunDeps | undefined): () => string {
  return deps?.clock ?? (() => new Date().toISOString());
}

const HELP = `workspec-trace — WorkSpec Traceability Workbench CLI

Usage:
  workspec-trace <command> [options]

Commands:
  emit      Emit test files from system-requirements (Rules) + scenarios (greenfield).
  ingest    Ingest a test toolchain's results into a run (evidence).
  verify    The CI gate: fail on validation errors, dangling refs, or a
            scenario-coverage / userReq-coverage / pass-rate floor.
  matrix    Export the RTM (requirements traceability matrix) as md/csv/html.
  mcp       Run the trace MCP server over stdio.

Run "workspec-trace <command> --help" for command options. This CLI never
invokes git — you commit. Available emitters: ${EMITTER_NAMES}.
`;

const EMIT_HELP = `workspec-trace emit — Rules + scenarios -> test files (greenfield)

Usage:
  workspec-trace emit --emitter <name> [--feature <slug>] [--out <dir>]
                      [--dir <root>] [--json]

Options:
  --emitter <name>   Emitter convention to use (${EMITTER_NAMES}). Required.
  --feature <slug>   Only emit Rules (system-requirements) whose feature is this slug.
  --out <dir>        Directory to write test files into (default: "features").
  --dir <root>       Working-tree root to load .workspec/ from (default: cwd).
  --json             Print the written-file report as JSON.

Loads every system-requirement (a Gherkin Rule, spec §4.4) and every scenario
under .workspec/, groups each Rule with the scenarios whose systemRequirement
is it, runs the emitter (one file per Rule — the feature-file-per-rule
convention), and WRITES the returned test files under --out. The only command
that writes test files. Invalid Rule/scenario files are skipped with a warning.
`;

const INGEST_HELP = `workspec-trace ingest — test results -> a run (evidence)

Usage:
  workspec-trace ingest <results-file> --emitter <name> [--id <id>] [--ts <iso>]
                        [--sha <sha>] [--ci <ci>] [--dir <root>]
                        [--runs-dir <dir>] [--json]

Options:
  --emitter <name>   Emitter that produced the results (${EMITTER_NAMES}). Required.
  --id <id>          Run id (default: derived from the run timestamp).
  --ts <iso>         ISO-8601 run timestamp (default: now).
  --sha <sha>        Commit SHA the run executed against.
  --ci <ci>          CI provider label, e.g. "github-actions".
  --dir <root>       Working-tree root (default: cwd).
  --runs-dir <dir>   Where to write the run (default: "${DEFAULT_RUNS_DIR}").
  --json             Print the run summary as JSON.

Reads <results-file> as raw text and hands it to --emitter's own ingest, which
knows its report format (e.g. cucumber's Cucumber JSON, junit's JUnit XML) and
maps scenarios back to scenario slugs via its tag convention. Writes
<runs-dir>/<id>.json. The runs dir is gitignore-able (spec §9.3); commit it to
keep an auditable history.
`;

const VERIFY_HELP = `workspec-trace verify — the CI gate

Usage:
  workspec-trace verify [--min-scenario-coverage <0..1>] [--min-userreq-coverage <0..1>]
                        [--min-pass-rate <0..1>] [--dir <root>] [--runs-dir <dir>] [--json]

Options:
  --min-scenario-coverage <0..1>  Fail if scenario coverage ratio is below this (default: 0).
  --min-userreq-coverage <0..1>   Fail if userReq coverage ratio is below this (default: 0).
  --min-pass-rate <0..1>          Fail if pass-rate ratio is below this (default: 0).
  --dir <root>                    Working-tree root (default: cwd).
  --runs-dir <dir>                Where runs are read from (default: "${DEFAULT_RUNS_DIR}").
  --json                          Emit the machine-readable model summary for CI.

Loads .workspec/, derives the model's THREE meters — scenario coverage, userReq
coverage, pass rate (spec §4.7/§5, shown side by side, never collapsed) — and
FAILS (exit 1) on: any loader validation issue; any error-severity finding
(dangling intra-tree ref or duplicate slug — spec §4.7); scenario coverage
below --min-scenario-coverage; userReq coverage below --min-userreq-coverage;
or pass-rate below --min-pass-rate. Error findings ALWAYS gate; the thresholds
are opt-in (default 0 = no floor). v0 uses ABSOLUTE thresholds —
regression-vs-baseline is v0.1 (spec §9.4). Exit codes: 0 pass, 1 gate failed,
2 usage error.
`;

const MATRIX_HELP = `workspec-trace matrix — the RTM as a generated artifact (spec §5/§6)

Usage:
  workspec-trace matrix [--out <file>] [--format md|csv|html] [--dir <root>]
                        [--runs-dir <dir>]

Options:
  --out <file>       Write the matrix here (repo-relative). The format is
                      inferred from its extension (.md/.csv/.html/.htm)
                      unless --format overrides it. Omit to print to stdout.
  --format <fmt>     Force the export format: md, csv, or html. Overrides
                      whatever --out's extension would imply.
  --dir <root>       Working-tree root to load .workspec/ from (default: cwd).
  --runs-dir <dir>   Where runs are read from (default: "${DEFAULT_RUNS_DIR}").

Loads .workspec/, derives the trace model, and projects it to the
requirements-traceability matrix (spec §5): one row per scenario — Feature,
Rule (system-requirement), Scenario, Verifies (the userReqs the Rule
verifies), Status (latest-run proof: pass/fail/skip/unproven), Run (latest
run id), SHA — plus one row per EMPTY Rule (a Rule with no scenarios at all
still needs surfacing: a requirement with no proof). Rows are ordered by
feature slug, then Rule slug, then scenario slug, so the artifact is
byte-stable and CI-diffable. A dangling scenario -> Rule or Rule -> feature
ref is shown as-authored, never silently dropped. Exit codes: 0 success, 1
write failure, 2 usage error (bad/unknown format, missing arg).
`;

// ── shared rendering ─────────────────────────────────────────────────────────

/** A meter as "N of M (P%)" — never collapsed to a single number (spec §5). */
function meterText(m: Meter): string {
  return `${m.numerator} of ${m.denominator} (${pct(m.ratio)})`;
}

function warnLoadIssues(prefix: string, issues: readonly LoadIssue[], io: CliIO): void {
  for (const issue of issues) {
    io.err(`${prefix}: warning: ${formatLoadIssue(issue)}\n`);
  }
}

// ── emit ─────────────────────────────────────────────────────────────────────

async function runEmit(argv: string[], io: CliIO, deps: RunDeps | undefined): Promise<number> {
  let values: {
    emitter?: string;
    feature?: string;
    out?: string;
    dir?: string;
    json?: boolean;
    help?: boolean;
  };
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        emitter: { type: 'string' },
        feature: { type: 'string' },
        out: { type: 'string' },
        dir: { type: 'string' },
        json: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
      },
      allowPositionals: false,
    }));
  } catch (error) {
    io.err(`emit: ${(error as Error).message}\n`);
    return 2;
  }
  if (values.help === true) {
    io.out(EMIT_HELP);
    return 0;
  }

  if (values.emitter === undefined) {
    io.err('emit: --emitter is required\n');
    return 2;
  }

  const dir = values.dir ?? process.cwd();
  const repository = resolveRepository(deps, dir);

  const outcome = await runEmitCore(
    {
      emitter: values.emitter,
      ...(values.feature !== undefined ? { feature: values.feature } : {}),
      ...(values.out !== undefined ? { out: values.out } : {}),
    },
    repository,
  );

  switch (outcome.kind) {
    case 'usage-error':
      io.err(`emit: ${outcome.message}\n`);
      return 2;
    case 'write-error':
      warnLoadIssues('emit', outcome.loadIssues, io);
      for (const w of outcome.scenarioWarnings) io.err(`emit: ${w}\n`);
      io.err(`emit: failed to write ${outcome.ref}: ${(outcome.error as Error).message}\n`);
      return 1;
    case 'ok': {
      warnLoadIssues('emit', outcome.loadIssues, io);
      for (const w of outcome.scenarioWarnings) io.err(`emit: ${w}\n`);
      if (values.json === true) {
        io.out(
          `${JSON.stringify(
            { emitter: outcome.emitter, count: outcome.files.length, files: outcome.files },
            null,
            2,
          )}\n`,
        );
      } else {
        io.out(`emit: wrote ${outcome.files.length} file(s) with the ${outcome.emitter} emitter\n`);
        for (const ref of outcome.files) io.out(`  ${ref}\n`);
      }
      return 0;
    }
  }
}

// ── ingest ───────────────────────────────────────────────────────────────────

async function runIngest(argv: string[], io: CliIO, deps: RunDeps | undefined): Promise<number> {
  let values: {
    emitter?: string;
    id?: string;
    ts?: string;
    sha?: string;
    ci?: string;
    dir?: string;
    'runs-dir'?: string;
    json?: boolean;
    help?: boolean;
  };
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({
      args: argv,
      options: {
        emitter: { type: 'string' },
        id: { type: 'string' },
        ts: { type: 'string' },
        sha: { type: 'string' },
        ci: { type: 'string' },
        dir: { type: 'string' },
        'runs-dir': { type: 'string' },
        json: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
      },
      allowPositionals: true,
    }));
  } catch (error) {
    io.err(`ingest: ${(error as Error).message}\n`);
    return 2;
  }
  if (values.help === true) {
    io.out(INGEST_HELP);
    return 0;
  }

  if (positionals.length !== 1) {
    io.err('ingest: expected exactly one <results-file> argument\n');
    return 2;
  }
  const resultsFile = positionals[0];
  if (resultsFile === undefined) {
    io.err('ingest: expected exactly one <results-file> argument\n');
    return 2;
  }
  if (values.emitter === undefined) {
    io.err('ingest: --emitter is required\n');
    return 2;
  }

  const dir = values.dir ?? process.cwd();
  const runsDir = values['runs-dir'] ?? DEFAULT_RUNS_DIR;
  const repository = resolveRepository(deps, dir);
  const clock = resolveClock(deps);

  // Validate the emitter/derived id BEFORE reading the results file: a usage
  // error (exit 2) must never be masked behind a read failure (exit 1) just
  // because the read happens to run first — this is the same check
  // `runIngestCore` runs internally, so the two can't drift.
  const validated = validateIngestArgs(
    {
      emitter: values.emitter,
      ...(values.id !== undefined ? { id: values.id } : {}),
      ...(values.ts !== undefined ? { ts: values.ts } : {}),
    },
    clock,
  );
  if (!validated.ok) {
    io.err(`ingest: ${validated.error.message}\n`);
    return 2;
  }

  let text: string;
  try {
    text = await repository.readFile(resultsFile);
  } catch (error) {
    io.err(`ingest: cannot read results file ${resultsFile}: ${(error as Error).message}\n`);
    return 1;
  }

  // Thread the ALREADY-derived `id`/`ts` through explicitly, rather than
  // letting `runIngestCore` re-derive them from `values.id`/`values.ts` a
  // second time: when both are omitted, re-deriving from a second
  // `clock()` call could (in principle, with a real wall clock) land on a
  // different id than the one just validated above.
  const outcome = await runIngestCore(
    {
      text,
      emitter: values.emitter,
      id: validated.id,
      ts: validated.ts,
      ...(values.sha !== undefined ? { sha: values.sha } : {}),
      ...(values.ci !== undefined ? { ci: values.ci } : {}),
      runsDir,
    },
    { repository, clock },
  );

  switch (outcome.kind) {
    case 'usage-error':
      io.err(`ingest: ${outcome.message}\n`);
      return 2;
    case 'write-error':
      io.err(`ingest: failed to write ${outcome.ref}: ${(outcome.error as Error).message}\n`);
      return 1;
    case 'ok': {
      if (values.json === true) {
        io.out(
          `${JSON.stringify(
            {
              ref: outcome.ref,
              id: outcome.id,
              total: outcome.total,
              pass: outcome.pass,
              fail: outcome.fail,
              skip: outcome.skip,
            },
            null,
            2,
          )}\n`,
        );
      } else {
        io.out(`ingest: wrote ${outcome.ref}\n`);
        io.out(
          `  ${outcome.total} result(s): ${outcome.pass} pass · ${outcome.fail} fail · ${outcome.skip} skip\n`,
        );
      }
      return 0;
    }
  }
}

// ── verify ───────────────────────────────────────────────────────────────────

/** Parse a `0..1` threshold flag; returns `null` on a malformed/out-of-range value. */
function parseThreshold(raw: string | undefined): number | null {
  if (raw === undefined) return 0;
  const value = Number(raw);
  return isValidThreshold(value) ? value : null;
}

function findingLine(f: Finding): string {
  const at = f.line !== undefined ? `${f.file}:${f.line}` : f.file;
  return `  [${f.severity}] ${f.kind}: ${f.message} (${at})`;
}

function loadIssueFinding(issue: LoadIssue): string {
  return `  [error] load-${issue.kind}: ${formatLoadIssue(issue)}`;
}

function renderVerifyHuman(result: VerifyResult, io: CliIO): void {
  io.out(
    `Scenario coverage: ${meterText(result.scenarioCoverage)}    ` +
      `UserReq coverage: ${meterText(result.userReqCoverage)}    ` +
      `Pass rate: ${meterText(result.passRate)}\n`,
  );
  io.out(
    result.latestRun !== null
      ? `Latest run: ${result.latestRun.id} @ ${result.latestRun.ts}\n`
      : 'Latest run: none (no evidence ingested yet)\n',
  );

  const errors = result.findings.filter((f) => f.severity === 'error');
  const warnings = result.findings.filter((f) => f.severity === 'warning');
  if (result.loadIssues.length + errors.length + warnings.length > 0) {
    io.out('\nFindings:\n');
    for (const issue of result.loadIssues) io.out(`${loadIssueFinding(issue)}\n`);
    for (const f of errors) io.out(`${findingLine(f)}\n`);
    for (const f of warnings) io.out(`${findingLine(f)}\n`);
  }

  io.out(
    result.verdict === 'pass'
      ? '\nverify: PASSED\n'
      : `\nverify: FAILED — ${result.reasons.join('; ')}\n`,
  );
}

async function runVerify(argv: string[], io: CliIO, deps: RunDeps | undefined): Promise<number> {
  let values: {
    'min-scenario-coverage'?: string;
    'min-userreq-coverage'?: string;
    'min-pass-rate'?: string;
    dir?: string;
    'runs-dir'?: string;
    json?: boolean;
    help?: boolean;
  };
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        'min-scenario-coverage': { type: 'string' },
        'min-userreq-coverage': { type: 'string' },
        'min-pass-rate': { type: 'string' },
        dir: { type: 'string' },
        'runs-dir': { type: 'string' },
        json: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
      },
      allowPositionals: false,
    }));
  } catch (error) {
    io.err(`verify: ${(error as Error).message}\n`);
    return 2;
  }
  if (values.help === true) {
    io.out(VERIFY_HELP);
    return 0;
  }

  const minScenarioCoverage = parseThreshold(values['min-scenario-coverage']);
  if (minScenarioCoverage === null) {
    io.err(
      `verify: --min-scenario-coverage must be a number in [0, 1], got "${values['min-scenario-coverage']}"\n`,
    );
    return 2;
  }
  const minUserReqCoverage = parseThreshold(values['min-userreq-coverage']);
  if (minUserReqCoverage === null) {
    io.err(
      `verify: --min-userreq-coverage must be a number in [0, 1], got "${values['min-userreq-coverage']}"\n`,
    );
    return 2;
  }
  const minPassRate = parseThreshold(values['min-pass-rate']);
  if (minPassRate === null) {
    io.err(
      `verify: --min-pass-rate must be a number in [0, 1], got "${values['min-pass-rate']}"\n`,
    );
    return 2;
  }

  const dir = values.dir ?? process.cwd();
  const runsDir = values['runs-dir'] ?? DEFAULT_RUNS_DIR;
  const repository = resolveRepository(deps, dir);

  const result = await runVerifyCore(
    { minScenarioCoverage, minUserReqCoverage, minPassRate, runsDir },
    repository,
  );

  if (values.json === true) {
    io.out(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    renderVerifyHuman(result, io);
  }

  return result.verdict === 'pass' ? 0 : 1;
}

// ── matrix ───────────────────────────────────────────────────────────────────

async function runMatrix(argv: string[], io: CliIO, deps: RunDeps | undefined): Promise<number> {
  let values: { out?: string; format?: string; dir?: string; 'runs-dir'?: string; help?: boolean };
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        out: { type: 'string' },
        format: { type: 'string' },
        dir: { type: 'string' },
        'runs-dir': { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
      allowPositionals: false,
    }));
  } catch (error) {
    io.err(`matrix: ${(error as Error).message}\n`);
    return 2;
  }
  if (values.help === true) {
    io.out(MATRIX_HELP);
    return 0;
  }

  const format = resolveMatrixFormat(values.out, values.format);
  if (format === undefined) {
    if (values.format !== undefined) {
      io.err(`matrix: unknown --format "${values.format}" (expected md, csv, or html)\n`);
    } else if (values.out !== undefined) {
      io.err(
        `matrix: cannot infer a format from --out "${values.out}" ` +
          `(expected a .md, .csv, or .html extension, or pass --format)\n`,
      );
    } else {
      io.err('matrix: either --out <file> or --format <md|csv|html> is required\n');
    }
    return 2;
  }

  const dir = values.dir ?? process.cwd();
  const runsDir = values['runs-dir'] ?? DEFAULT_RUNS_DIR;
  const repository = resolveRepository(deps, dir);

  const result = await runMatrixCore({ format, runsDir }, repository);
  warnLoadIssues('matrix', result.loadIssues, io);

  if (values.out === undefined) {
    io.out(result.content);
    return 0;
  }

  try {
    await repository.writeFile(values.out, result.content);
  } catch (error) {
    io.err(`matrix: failed to write ${values.out}: ${(error as Error).message}\n`);
    return 1;
  }
  io.out(`matrix: wrote ${values.out} (${format}, ${result.rows.length} row(s))\n`);
  return 0;
}

// ── dispatch ─────────────────────────────────────────────────────────────────

/**
 * The CLI entry point. Parses `argv` (already stripped of `node` + script),
 * dispatches to a subcommand, and resolves to the process exit code. Writes
 * through `io` (defaults to the real stdout/stderr). `deps` injects test doubles
 * for the repository/clock a command would otherwise build itself.
 */
export async function run(argv: string[], io: CliIO = defaultIO, deps?: RunDeps): Promise<number> {
  const [command, ...rest] = argv;
  switch (command) {
    case 'emit':
      return runEmit(rest, io, deps);
    case 'ingest':
      return runIngest(rest, io, deps);
    case 'verify':
      return runVerify(rest, io, deps);
    case 'matrix':
      return runMatrix(rest, io, deps);
    case 'mcp':
      return runMcp(rest, io);
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      io.out(HELP);
      return 0;
    default:
      io.err(`workspec-trace: unknown command "${command}"\n`);
      io.out(HELP);
      return 2;
  }
}
