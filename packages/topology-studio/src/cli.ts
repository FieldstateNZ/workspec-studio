// The `workspec-topology` CLI — author/validate/import/reconcile/cost a
// topology over a working tree of topology artifacts.
//
// `run(argv, io, deps)` is the testable entry point: it returns a process
// exit code and writes through an injectable IO (defaulting to the real
// streams), so tests can drive it and capture output without spawning a
// process. `deps` lets tests inject a `repository` in place of the default
// filesystem wiring. `bin.ts` is the only thing that touches `process`.
//
// With no command, "serve" runs — mirroring `@workspec/decision-studio`'s
// CLI (the primary template for this package).

import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { ADAPTERS } from '@workspec/topology-adapters';
import type { AdapterName } from '@workspec/topology-adapters';
import { computeTopologyCost } from '@workspec/topology-cost';
import { reconcile, summarizeDrift } from '@workspec/topology-recon';
import type { Drift } from '@workspec/topology-recon';
import type { TopologyDiagnostic } from '@workspec/topology-model';
import { derivedDirFor, loadDerivedTopology, writeDerivedResources } from './derived-topology.js';
import { formatDiagnostic } from './format-diagnostic.js';
import { FsRepository } from './fs-repository.js';
import { loadAuthoredModel } from './load-authored-model.js';
import { loadCatalog } from './load-catalog.js';
import { buildLens, renderLensText } from './render-lens.js';
import { resolveModelForEnv } from './resolve-model.js';
import { runMcp } from './run-mcp.js';
import { runServe } from './serve.js';

/** Injectable IO. `out` is reserved for artifacts (report text/JSON); `err` for diagnostics. */
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
 * own default: `FsRepository` rooted at `--dir` (or cwd).
 */
export interface RunDeps {
  repository?: FsRepository;
}

function resolveRepository(deps: RunDeps | undefined, dir: string): FsRepository {
  if (deps?.repository !== undefined) return deps.repository;
  return new FsRepository(dir);
}

const HELP = `workspec-topology — author, validate, import, reconcile, and cost an infrastructure topology

Usage:
  workspec-topology [command] [options]

Commands:
  serve       Run the localhost host shell over a directory (DEFAULT command).
  validate    Validate the whole topology tree under a directory (CI-friendly).
  import      Import derived resources from a vendor source into .topology-actual/<env>/.
  reconcile   Reconcile authored vs. derived (imported) state for one environment (CI-friendly).
  cost        Compute cost + c4-container attribution for one environment.
  render      Print a textual/JSON view of a resolved topology's lens tree.
  mcp         Run the topology MCP server over stdio.

With no command, "serve" runs. Run "workspec-topology <command> --help" for
command options.
`;

const VALIDATE_HELP = `workspec-topology validate — validate the whole topology tree under a directory

Usage:
  workspec-topology validate [--dir <path>] [--json]

Options:
  --dir <path>   Directory to scan (default: current directory).
  --json         Also print the diagnostics array as JSON to stdout.

Loads the whole tree (\`.workspec/{topologies,resources,environments}\`) and
reports every schema/parse error, the no-topology/multiple-topologies
file-count checks, and every dangling cross-reference. Prints
"file:line:col: severity: message" diagnostics and exits non-zero on any
error-severity diagnostic.
`;

const IMPORT_HELP = `workspec-topology import — import derived resources from a vendor source

Usage:
  workspec-topology import <adapter> --env <env> --input <file> [--dir <path>]

Arguments:
  <adapter>      One of: ${Object.keys(ADAPTERS).join(', ')}.

Options:
  --env <env>    Environment slug this import is for (required).
  --input <file> Path to the already-exported vendor JSON (terraform show -json
                 output, a compiled ARM template, or an Azure Resource Graph
                 query result) — required.
  --dir <path>   Directory to write into (default: current directory).

Runs the named @workspec/topology-adapters adapter over --input and writes
the derived Resource artifacts to ".topology-actual/<env>/" (gitignored,
tool-generated — see that directory's own doc comment in derived-topology.ts).
Prints one line per adapter diagnostic and exits 1 if any is error-severity.
`;

const RECONCILE_HELP = `workspec-topology reconcile — reconcile authored vs. derived state for one environment

Usage:
  workspec-topology reconcile --env <env> [--dir <path>]

Options:
  --env <env>    Environment slug to reconcile (required).
  --dir <path>   Directory to scan (default: current directory).

Resolves the authored topology for --env, loads that environment's derived
resources from ".topology-actual/<env>/" (written by a prior "import"), and
reports every phantom/orphan/divergent/miswired drift. EXITS 1 IF ANY DRIFT
IS FOUND — this is the CI gate: a clean "git diff"-free reconcile exits 0.
`;

const COST_HELP = `workspec-topology cost — compute cost for one environment

Usage:
  workspec-topology cost --env <env> [--dir <path>] [--format table|json]

Options:
  --env <env>           Environment slug to price (required).
  --dir <path>          Directory to scan (default: current directory).
  --format table|json   Output format (default: table).

Resolves the topology for --env, loads the pricing catalog its spec.catalog
slug names from ".workspec/catalogs/", and prints the topology-wide monthly
total plus the committed/schedulable split.
`;

const RENDER_HELP = `workspec-topology render — print a resolved topology's lens tree

Usage:
  workspec-topology render --env <env> --lens network|rg [--dir <path>] [--format text|json]

Options:
  --env <env>            Environment slug to resolve (required).
  --lens network|rg      Which normative lens to build (required).
  --dir <path>           Directory to scan (default: current directory).
  --format text|json     Output format (default: text).

Full SVG rendering is @workspec/topology-ui's job (TopologyCanvas) — this
command prints a textual outline or the raw LensTree JSON, for terminal/CI
reading and scripting.
`;

function printModelDiagnostics(model: { diagnostics: readonly TopologyDiagnostic[] }, io: CliIO): void {
  for (const diagnostic of model.diagnostics) io.err(formatDiagnostic(diagnostic));
}

// ── validate ─────────────────────────────────────────────────────────────

async function runValidate(argv: string[], io: CliIO, deps: RunDeps | undefined): Promise<number> {
  let values: { dir?: string; json?: boolean; help?: boolean };
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        dir: { type: 'string' },
        json: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
      },
      allowPositionals: false,
    }));
  } catch (error) {
    io.err(`validate: ${(error as Error).message}\n`);
    return 2;
  }
  if (values.help === true) {
    io.out(VALIDATE_HELP);
    return 0;
  }

  const dir = values.dir ?? process.cwd();
  const repository = resolveRepository(deps, dir);
  const model = await loadAuthoredModel(repository);

  printModelDiagnostics(model, io);
  if (values.json === true) io.out(`${JSON.stringify(model.diagnostics)}\n`);

  const errorCount = model.diagnostics.filter((d) => d.severity === 'error').length;
  const warningCount = model.diagnostics.filter((d) => d.severity === 'warning').length;

  if (errorCount === 0) {
    const suffix = warningCount > 0 ? `, ${warningCount} warning(s)` : '';
    io.err(`validate: tree OK${suffix}\n`);
    return 0;
  }
  io.err(`validate: ${errorCount} error(s), ${warningCount} warning(s)\n`);
  return 1;
}

// ── import ───────────────────────────────────────────────────────────────

async function runImport(argv: string[], io: CliIO, deps: RunDeps | undefined): Promise<number> {
  let values: { env?: string; input?: string; dir?: string; help?: boolean };
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({
      args: argv,
      options: {
        env: { type: 'string' },
        input: { type: 'string' },
        dir: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
      allowPositionals: true,
    }));
  } catch (error) {
    io.err(`import: ${(error as Error).message}\n`);
    return 2;
  }
  if (values.help === true) {
    io.out(IMPORT_HELP);
    return 0;
  }
  const adapterName = positionals[0];
  if (adapterName === undefined) {
    io.err('import: expected exactly one <adapter> argument\n');
    return 2;
  }
  if (!(adapterName in ADAPTERS)) {
    io.err(`import: unknown adapter "${adapterName}" — expected one of: ${Object.keys(ADAPTERS).join(', ')}\n`);
    return 2;
  }
  if (values.env === undefined) {
    io.err('import: --env is required\n');
    return 2;
  }
  if (values.input === undefined) {
    io.err('import: --input <file> is required\n');
    return 2;
  }

  let raw: string;
  try {
    raw = await readFile(values.input, 'utf8');
  } catch (error) {
    io.err(`import: could not read --input "${values.input}": ${(error as Error).message}\n`);
    return 2;
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    io.err(`import: --input "${values.input}" is not valid JSON: ${(error as Error).message}\n`);
    return 2;
  }

  const dir = values.dir ?? process.cwd();
  const repository = resolveRepository(deps, dir);
  const adapter = ADAPTERS[adapterName as AdapterName];
  const { resources, diagnostics } = adapter(json);

  for (const diagnostic of diagnostics) {
    const source = diagnostic.source !== undefined ? ` (${diagnostic.source})` : '';
    io.err(`import: ${diagnostic.severity}: ${diagnostic.message}${source}\n`);
  }

  const refs = await writeDerivedResources(repository, values.env, resources);
  io.err(`import: wrote ${refs.length} resource(s) to ${derivedDirFor(values.env)}/\n`);

  return diagnostics.some((d) => d.severity === 'error') ? 1 : 0;
}

// ── reconcile ────────────────────────────────────────────────────────────

function driftHeadline(drift: Drift): string {
  switch (drift.class) {
    case 'phantom':
      return `phantom  ${drift.slug}`;
    case 'orphan':
      return `orphan   ${drift.slug}`;
    case 'divergent':
      return `divergent ${drift.authoredSlug}`;
    case 'miswired':
      return `miswired ${drift.slugs.join(', ')}`;
  }
}

async function runReconcile(argv: string[], io: CliIO, deps: RunDeps | undefined): Promise<number> {
  let values: { env?: string; dir?: string; help?: boolean };
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        env: { type: 'string' },
        dir: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
      allowPositionals: false,
    }));
  } catch (error) {
    io.err(`reconcile: ${(error as Error).message}\n`);
    return 2;
  }
  if (values.help === true) {
    io.out(RECONCILE_HELP);
    return 0;
  }
  if (values.env === undefined) {
    io.err('reconcile: --env is required\n');
    return 2;
  }

  const dir = values.dir ?? process.cwd();
  const repository = resolveRepository(deps, dir);
  const model = await loadAuthoredModel(repository);
  if (model.topology === null) {
    printModelDiagnostics(model, io);
    io.err('reconcile: no single topology found\n');
    return 1;
  }
  const resolved = resolveModelForEnv(model, values.env);
  if (resolved === undefined) {
    io.err('reconcile: could not resolve the topology\n');
    return 1;
  }

  const outcome = await loadDerivedTopology(repository, values.env);
  if (outcome.kind === 'read-error') {
    io.err(`${outcome.ref}: ${(outcome.error as Error).message}\n`);
    return 1;
  }

  const drifts = reconcile(resolved, outcome.derived, values.env);
  const summary = summarizeDrift(drifts);

  for (const drift of drifts) io.err(`${driftHeadline(drift)}: ${drift.message}\n`);
  io.err(
    `reconcile: ${summary.total} drift(s) — ${Object.entries(summary.countsByClass)
      .map(([cls, count]) => `${count} ${cls}`)
      .join(', ')}\n`,
  );

  return summary.hasDrift ? 1 : 0;
}

// ── cost ─────────────────────────────────────────────────────────────────

async function runCost(argv: string[], io: CliIO, deps: RunDeps | undefined): Promise<number> {
  let values: { env?: string; dir?: string; format?: string; help?: boolean };
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        env: { type: 'string' },
        dir: { type: 'string' },
        format: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
      allowPositionals: false,
    }));
  } catch (error) {
    io.err(`cost: ${(error as Error).message}\n`);
    return 2;
  }
  if (values.help === true) {
    io.out(COST_HELP);
    return 0;
  }
  if (values.env === undefined) {
    io.err('cost: --env is required\n');
    return 2;
  }
  const format = values.format ?? 'table';
  if (format !== 'table' && format !== 'json') {
    io.err(`cost: invalid --format "${values.format}" (expected table|json)\n`);
    return 2;
  }

  const dir = values.dir ?? process.cwd();
  const repository = resolveRepository(deps, dir);
  const model = await loadAuthoredModel(repository);
  if (model.topology === null) {
    io.err('cost: no single topology found\n');
    return 1;
  }
  const resolved = resolveModelForEnv(model, values.env);
  if (resolved === undefined) {
    io.err('cost: could not resolve the topology\n');
    return 1;
  }
  if (resolved.catalog === null) {
    io.err('cost: this topology declares no spec.catalog — nothing to price against\n');
    return 1;
  }

  const catalogOutcome = await loadCatalog(repository, resolved.catalog);
  if (catalogOutcome.kind === 'not-found') {
    io.err(`cost: catalog not found: ${catalogOutcome.ref}\n`);
    return 1;
  }
  if (catalogOutcome.kind === 'invalid') {
    for (const issue of catalogOutcome.issues) {
      io.err(`${catalogOutcome.ref}:${issue.line}:${issue.col}: error: ${issue.message}\n`);
    }
    return 1;
  }

  const result = computeTopologyCost(resolved, catalogOutcome.catalog);
  for (const diagnostic of result.diagnostics) io.err(`cost: warning: ${diagnostic.message}\n`);

  if (format === 'json') {
    io.out(`${JSON.stringify(result)}\n`);
    return 0;
  }

  io.out(`Cost · ${result.envSlug}\n`);
  io.out(`  total:       ${result.totals.all.toFixed(2)}\n`);
  io.out(`  committed:   ${result.totals.committed.toFixed(2)}\n`);
  io.out(`  schedulable: ${result.totals.schedulable.toFixed(2)}\n`);
  for (const group of result.byResourceGroup) {
    io.out(`  rg ${group.key ?? '(none)'}: ${group.monthly.toFixed(2)}\n`);
  }
  return 0;
}

// ── render ───────────────────────────────────────────────────────────────

async function runRender(argv: string[], io: CliIO, deps: RunDeps | undefined): Promise<number> {
  let values: { env?: string; lens?: string; dir?: string; format?: string; help?: boolean };
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        env: { type: 'string' },
        lens: { type: 'string' },
        dir: { type: 'string' },
        format: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
      allowPositionals: false,
    }));
  } catch (error) {
    io.err(`render: ${(error as Error).message}\n`);
    return 2;
  }
  if (values.help === true) {
    io.out(RENDER_HELP);
    return 0;
  }
  if (values.env === undefined) {
    io.err('render: --env is required\n');
    return 2;
  }
  if (values.lens !== 'network' && values.lens !== 'rg') {
    io.err('render: --lens must be "network" or "rg"\n');
    return 2;
  }
  const format = values.format ?? 'text';
  if (format !== 'text' && format !== 'json') {
    io.err(`render: invalid --format "${values.format}" (expected text|json)\n`);
    return 2;
  }

  const dir = values.dir ?? process.cwd();
  const repository = resolveRepository(deps, dir);
  const model = await loadAuthoredModel(repository);
  if (model.topology === null) {
    io.err('render: no single topology found\n');
    return 1;
  }
  const resolved = resolveModelForEnv(model, values.env);
  if (resolved === undefined) {
    io.err('render: could not resolve the topology\n');
    return 1;
  }

  const tree = buildLens(resolved, values.lens);
  io.out(format === 'json' ? `${JSON.stringify(tree)}\n` : renderLensText(tree));
  return 0;
}

// ── dispatch ─────────────────────────────────────────────────────────────

/**
 * The CLI entry point. Parses `argv` (already stripped of `node` + script),
 * dispatches to a subcommand, and resolves to the process exit code. Writes
 * through `io` (defaults to the real stdout/stderr). `deps` injects test
 * doubles for the repository a command would otherwise build itself.
 */
export async function run(argv: string[], io: CliIO = defaultIO, deps?: RunDeps): Promise<number> {
  const [command, ...rest] = argv;
  switch (command) {
    case 'validate':
      return runValidate(rest, io, deps);
    case 'import':
      return runImport(rest, io, deps);
    case 'reconcile':
      return runReconcile(rest, io, deps);
    case 'cost':
      return runCost(rest, io, deps);
    case 'render':
      return runRender(rest, io, deps);
    case 'serve':
    case undefined:
      return runServe(rest, io);
    case 'mcp':
      return runMcp(rest, io);
    case 'help':
    case '--help':
    case '-h':
      io.out(HELP);
      return 0;
    default:
      io.err(`workspec-topology: unknown command "${command}"\n`);
      io.out(HELP);
      return 2;
  }
}
