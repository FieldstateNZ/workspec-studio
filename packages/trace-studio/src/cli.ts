// The `workspec-trace` CLI — emit / ingest / verify over a working tree of
// traceability artifacts (spec §6). This is the T4 milestone: shippable value,
// zero frontend.
//
// `run(argv, io, deps)` is the testable entry point: it returns a process exit
// code and writes through an injectable `CliIO` (defaulting to the real
// streams), so tests drive it and capture output without spawning a process.
// `deps` injects a `repository` (the fs boundary) and a `clock` in place of the
// default `FsRepository`/wall-clock wiring, so ingest is deterministic under
// test. `bin.ts` is the ONLY thing that touches `process`.
//
// Exit codes are the contract CI keys on: 0 = pass, 1 = gate failed (verify) or
// a runtime error, 2 = usage error (unknown command/flag, missing arg, bad
// value). This CLI NEVER invokes git — the human commits.

import { posix } from 'node:path';
import { parseArgs } from 'node:util';
import { TestRun as TestRunSchema } from '@workspec/req-schema';
import { buildModel } from '@workspec/trace-model';
import type { Finding, Meter, TraceModel } from '@workspec/trace-model';
import { emitters, getEmitter, groupScenariosByRule } from '@workspec/trace-emitters';
import { DEFAULT_RUNS_DIR, FsRepository } from './fs-repository.js';
import type { LoadIssue, TraceRepositoryPort } from './repository.js';

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
 * Injectable dependencies, for tests. When omitted, each command builds its own
 * default: an `FsRepository` rooted at `--dir` (or cwd) and a real wall-clock
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

const EMITTER_NAMES = emitters.map((e) => e.name).join(', ');

const HELP = `workspec-trace — WorkSpec Traceability Workbench CLI

Usage:
  workspec-trace <command> [options]

Commands:
  emit      Emit test files from system-requirements (Rules) + scenarios (greenfield).
  ingest    Ingest a test toolchain's results into a run (evidence).
  verify    The CI gate: fail on validation errors, dangling refs, or a
            scenario-coverage / userReq-coverage / pass-rate floor.

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

Reads <results-file> (a Cucumber JSON report), maps scenarios back to scenario
slugs via the emitter's tag convention, and writes <runs-dir>/<id>.json. The
runs dir is gitignore-able (spec §9.3); commit it to keep an auditable history.
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

// ── shared rendering ─────────────────────────────────────────────────────────

function pct(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

/** A meter as "N of M (P%)" — never collapsed to a single number (spec §5). */
function meterText(m: Meter): string {
  return `${m.numerator} of ${m.denominator} (${pct(m.ratio)})`;
}

function warnLoadIssues(prefix: string, issues: readonly LoadIssue[], io: CliIO): void {
  for (const issue of issues) {
    const at = issue.line !== undefined ? `${issue.file}:${issue.line}` : issue.file;
    io.err(`${prefix}: warning: ${at}: ${issue.message}\n`);
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
  const emitter = getEmitter(values.emitter);
  if (emitter === undefined) {
    io.err(`emit: unknown emitter "${values.emitter}" (available: ${EMITTER_NAMES})\n`);
    return 2;
  }

  const dir = values.dir ?? process.cwd();
  const out = values.out ?? 'features';
  const repository = resolveRepository(deps, dir);

  const { tree, issues } = await repository.loadTree();
  warnLoadIssues('emit', issues, io);

  // A scenario whose parent Rule isn't in the tree can't be emitted (it lands
  // under a group key nothing retrieves) — warn so the author isn't left with a
  // silently incomplete suite. Checked against ALL rules, not the
  // --feature-filtered set. `verify` also flags this as a dangling-ref.
  const ruleSlugs = new Set(tree.systemRequirements.map((s) => s.slug));
  for (const scenario of tree.scenarios) {
    const parent = scenario.artifact.spec.systemRequirement;
    if (!ruleSlugs.has(parent)) {
      io.err(`emit: scenario "${scenario.slug}" references unknown rule "${parent}" — skipped\n`);
    }
  }

  const systemRequirements =
    values.feature !== undefined
      ? tree.systemRequirements.filter((s) => s.artifact.spec.feature === values.feature)
      : tree.systemRequirements;

  const rules = groupScenariosByRule({ ...tree, systemRequirements });
  const files = emitter.emit(rules);

  const written: string[] = [];
  for (const file of files) {
    const ref = posix.join(out, file.path);
    try {
      await repository.writeFile(ref, file.content);
    } catch (error) {
      io.err(`emit: failed to write ${ref}: ${(error as Error).message}\n`);
      return 1;
    }
    written.push(ref);
  }

  if (values.json === true) {
    io.out(
      `${JSON.stringify({ emitter: emitter.name, count: written.length, files: written }, null, 2)}\n`,
    );
  } else {
    io.out(`emit: wrote ${written.length} file(s) with the ${emitter.name} emitter\n`);
    for (const ref of written) io.out(`  ${ref}\n`);
  }
  return 0;
}

// ── ingest ───────────────────────────────────────────────────────────────────

/** Filesystem-safe run id: no path separators, no leading dot. Matches the derived timestamp stem. */
const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** Derive a filesystem-safe run id from an ISO timestamp (spec §4.5 style: `2026-07-09T02-14-07Z`). */
function runIdFromTimestamp(ts: string): string {
  return ts.replace(/\.\d+Z$/, 'Z').replace(/:/g, '-');
}

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
  const emitter = getEmitter(values.emitter);
  if (emitter === undefined) {
    io.err(`ingest: unknown emitter "${values.emitter}" (available: ${EMITTER_NAMES})\n`);
    return 2;
  }

  const clock = resolveClock(deps);
  const ts = values.ts ?? clock();
  const id = values.id ?? runIdFromTimestamp(ts);
  if (!RUN_ID_PATTERN.test(id)) {
    io.err(`ingest: invalid --id "${id}" (must be a filename-safe id: no path separators)\n`);
    return 2;
  }

  const dir = values.dir ?? process.cwd();
  const runsDir = values['runs-dir'] ?? DEFAULT_RUNS_DIR;
  const repository = resolveRepository(deps, dir);

  let text: string;
  try {
    text = await repository.readFile(resultsFile);
  } catch (error) {
    io.err(`ingest: cannot read results file ${resultsFile}: ${(error as Error).message}\n`);
    return 1;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    io.err(`ingest: results file ${resultsFile} is not valid JSON: ${(error as Error).message}\n`);
    return 1;
  }

  const run = emitter.ingest(raw, {
    id,
    ts,
    ...(values.sha !== undefined ? { sha: values.sha } : {}),
    ...(values.ci !== undefined ? { ci: values.ci } : {}),
  });

  // Defensive: a bad --ts/--id would yield an invalid run — reject before writing.
  const validated = TestRunSchema.safeParse(run);
  if (!validated.success) {
    const first = validated.error.issues[0];
    io.err(`ingest: produced an invalid run: ${first ? first.message : 'schema violation'}\n`);
    return 2;
  }

  const ref = posix.join(runsDir, `${id}.json`);
  try {
    await repository.writeFile(ref, `${JSON.stringify(run, null, 2)}\n`);
  } catch (error) {
    io.err(`ingest: failed to write ${ref}: ${(error as Error).message}\n`);
    return 1;
  }

  const counts = { pass: 0, fail: 0, skip: 0 };
  for (const verdict of Object.values(run.results)) counts[verdict] += 1;
  const total = Object.keys(run.results).length;

  if (values.json === true) {
    io.out(`${JSON.stringify({ ref, id, total, ...counts }, null, 2)}\n`);
  } else {
    io.out(`ingest: wrote ${ref}\n`);
    io.out(
      `  ${total} result(s): ${counts.pass} pass · ${counts.fail} fail · ${counts.skip} skip\n`,
    );
  }
  return 0;
}

// ── verify ───────────────────────────────────────────────────────────────────

/** Parse a `0..1` threshold flag; returns `null` on a malformed/out-of-range value. */
function parseThreshold(raw: string | undefined): number | null {
  if (raw === undefined) return 0;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 1) return null;
  return value;
}

interface VerifyGate {
  verdict: 'pass' | 'fail';
  reasons: string[];
}

function evaluateGate(
  model: TraceModel,
  loadIssues: readonly LoadIssue[],
  minScenarioCoverage: number,
  minUserReqCoverage: number,
  minPassRate: number,
): VerifyGate {
  const reasons: string[] = [];
  if (loadIssues.length > 0) {
    reasons.push(`${loadIssues.length} loader validation issue(s)`);
  }
  const errorFindings = model.findings.filter((f) => f.severity === 'error');
  if (errorFindings.length > 0) {
    reasons.push(`${errorFindings.length} error finding(s)`);
  }
  if (model.scenarioCoverage.ratio < minScenarioCoverage) {
    reasons.push(
      `scenario coverage ${pct(model.scenarioCoverage.ratio)} below floor ${pct(minScenarioCoverage)}`,
    );
  }
  if (model.userReqCoverage.ratio < minUserReqCoverage) {
    reasons.push(
      `userReq coverage ${pct(model.userReqCoverage.ratio)} below floor ${pct(minUserReqCoverage)}`,
    );
  }
  if (model.passRate.ratio < minPassRate) {
    reasons.push(`pass-rate ${pct(model.passRate.ratio)} below floor ${pct(minPassRate)}`);
  }
  return { verdict: reasons.length > 0 ? 'fail' : 'pass', reasons };
}

function findingLine(f: Finding): string {
  const at = f.line !== undefined ? `${f.file}:${f.line}` : f.file;
  return `  [${f.severity}] ${f.kind}: ${f.message} (${at})`;
}

function loadIssueFinding(issue: LoadIssue): string {
  const at = issue.line !== undefined ? `${issue.file}:${issue.line}` : issue.file;
  return `  [error] load-${issue.kind}: ${issue.message} (${at})`;
}

function renderVerifyHuman(
  model: TraceModel,
  loadIssues: readonly LoadIssue[],
  gate: VerifyGate,
  io: CliIO,
): void {
  io.out(
    `Scenario coverage: ${meterText(model.scenarioCoverage)}    ` +
      `UserReq coverage: ${meterText(model.userReqCoverage)}    ` +
      `Pass rate: ${meterText(model.passRate)}\n`,
  );
  io.out(
    model.latestRun !== null
      ? `Latest run: ${model.latestRun.id} @ ${model.latestRun.ts}\n`
      : 'Latest run: none (no evidence ingested yet)\n',
  );

  const errors = model.findings.filter((f) => f.severity === 'error');
  const warnings = model.findings.filter((f) => f.severity === 'warning');
  if (loadIssues.length + errors.length + warnings.length > 0) {
    io.out('\nFindings:\n');
    for (const issue of loadIssues) io.out(`${loadIssueFinding(issue)}\n`);
    for (const f of errors) io.out(`${findingLine(f)}\n`);
    for (const f of warnings) io.out(`${findingLine(f)}\n`);
  }

  io.out(
    gate.verdict === 'pass'
      ? '\nverify: PASSED\n'
      : `\nverify: FAILED — ${gate.reasons.join('; ')}\n`,
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

  const loadedTree = await repository.loadTree();
  const loadedRuns = await repository.loadRuns(runsDir);
  const loadIssues: LoadIssue[] = [...loadedTree.issues, ...loadedRuns.issues];

  const model = buildModel(loadedTree.tree, loadedRuns.runs);
  const gate = evaluateGate(
    model,
    loadIssues,
    minScenarioCoverage,
    minUserReqCoverage,
    minPassRate,
  );

  if (values.json === true) {
    io.out(
      `${JSON.stringify(
        {
          verdict: gate.verdict,
          reasons: gate.reasons,
          thresholds: { minScenarioCoverage, minUserReqCoverage, minPassRate },
          scenarioCoverage: model.scenarioCoverage,
          userReqCoverage: model.userReqCoverage,
          passRate: model.passRate,
          latestRun: model.latestRun,
          findings: model.findings,
          loadIssues,
        },
        null,
        2,
      )}\n`,
    );
  } else {
    renderVerifyHuman(model, loadIssues, gate, io);
  }

  return gate.verdict === 'pass' ? 0 : 1;
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
