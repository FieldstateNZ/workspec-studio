// The `workspec-cost` CLI — stocktake / validate / report / plan / apply over
// a working tree of cost artifacts.
//
// `run(argv, io, deps)` is the testable entry point: it returns a process
// exit code and writes through an injectable IO (defaulting to the real
// streams), so tests can drive it and capture output without spawning a
// process. `deps` lets tests inject a `repository`, `provider`, and/or
// `clock` in place of the default filesystem/Azure/wall-clock wiring — see
// each `runXxx` below. `bin.ts` is the only thing that touches `process`.
//
// This CLI NEVER invokes git — the human commits. `stocktake` overwrites a
// STABLE inventory path, so `git diff` on the working tree IS the drift
// report; `plan`/`apply` follow the same "you commit, we never do" rule.

import { parseArgs } from 'node:util';
import type { CostRepositoryPort, ParseIssue } from '@workspec/cost-schema';
import type { CloudProviderPort, Drift } from '@workspec/cost-provider';
import { createAzureProvider } from '@workspec/cost-provider-azure';
import { computeApply } from './apply-core.js';
import { collectDiagnostics } from './collect-diagnostics.js';
import { formatDiagnostic } from './format-diagnostic.js';
import { ArtifactValidationError, FsRepository } from './fs-repository.js';
import { computePlan } from './plan-core.js';
import { computeReport } from './report-core.js';
import { renderReport } from './report-render.js';
import { runMcp } from './run-mcp.js';
import { runServe } from './serve.js';
import { runStocktakeCore } from './stocktake-core.js';

/** Injectable IO. `out` is reserved for artifacts (report's table/json/csv); `err` for diagnostics. */
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
 * own default: `FsRepository` rooted at `--dir` (or cwd), `createAzureProvider()`,
 * and a real wall-clock `clock`.
 */
export interface RunDeps {
  repository?: CostRepositoryPort;
  provider?: CloudProviderPort;
  clock?: () => string;
}

function resolveRepository(deps: RunDeps | undefined, dir: string): CostRepositoryPort {
  return deps?.repository ?? new FsRepository(dir);
}

function resolveProvider(deps: RunDeps | undefined): CloudProviderPort {
  return deps?.provider ?? createAzureProvider();
}

function resolveClock(deps: RunDeps | undefined): () => string {
  return deps?.clock ?? (() => new Date().toISOString());
}

const HELP = `workspec-cost — cost attribution for WorkSpec Studio

Usage:
  workspec-cost <command> [options]

Commands:
  stocktake   Stock-take an estate + its spend from the cloud provider.
  validate    Validate every cost artifact under a directory (CI-friendly).
  report      Print a coverage headline + rollup by dimension.
  plan        Compute the tag plan needed to converge on an attribution.
  apply       Apply (or dry-run) a tag plan against the live provider.
  serve       Run the localhost Cost Studio host over a directory.
  mcp         Run the cost MCP server over stdio.

Run "workspec-cost <command> --help" for command options. With no command,
this help is printed — "serve" is NOT the implicit default (divergence from
@workspec/decision-studio's CLI). This CLI never invokes git — stocktake
overwrites a STABLE inventory path, so a plain "git diff" on your working
tree is the drift report.
`;

const STOCKTAKE_HELP = `workspec-cost stocktake — stock-take an estate + its spend

Usage:
  workspec-cost stocktake --subscription <id> [--subscription <id>...]
                           [--name <slug>] [--period YYYY-MM] [--dir <dir>]

Options:
  --subscription <id>  Subscription to include (repeatable, required).
  --name <slug>        Stable inventory/spend slug (default: "estate"). Becomes
                        the filename, so it must be a valid slug: lowercase
                        alphanumeric segments separated by single hyphens.
  --period <YYYY-MM>   Billing period to fetch (default: current month).
  --dir <path>         Directory to write into (default: current directory).

Writes/overwrites ".workspec/inventories/<name>.yaml" (a STABLE path —
re-running updates the same file, so "git diff" against it is the drift
report) and ".workspec/spends/<name>-<period>.yaml". Prints a drift summary
before overwriting an existing inventory.
`;

const VALIDATE_HELP = `workspec-cost validate — validate all cost artifacts under a directory

Usage:
  workspec-cost validate [--dir <path>] [--json]

Options:
  --dir <path>   Directory to scan (default: current directory).
  --json         Also print the diagnostics array as JSON to stdout.

Zod-validates every inventory/spend/attribution/tag-plan artifact. When at
least one inventory and one attribution are present, also runs the
attribution engine over every (inventory, attribution) pairing (joining any
spends found) and prints its diagnostics as non-fatal warnings. Prints
"ref:line:col: error: message" diagnostics and exits non-zero on any error.
`;

// Re-exported for existing external importers of `ValidateDiagnostic` from
// this module; the type itself now lives with `collectDiagnostics` in
// `collect-diagnostics.ts`, its actual producer.
export type { ValidateDiagnostic } from './collect-diagnostics.js';

const REPORT_HELP = `workspec-cost report — coverage headline + rollup by dimension

Usage:
  workspec-cost report [--by <dimensionId>] [--format table|json|csv] [--dir <path>]

Options:
  --by <dimensionId>        Dimension to roll up by (default: primary dimension).
  --format table|json|csv   Output format (default: table).
  --dir <path>              Directory to scan (default: current directory).

Requires exactly one inventory and one attribution in scope; joins every
spend found. Mixed-currency/orphan-spend diagnostics print as warnings on
stderr.
`;

const PLAN_HELP = `workspec-cost plan — compute the tag plan needed to converge on an attribution

Usage:
  workspec-cost plan [--map <dimensionId>=<tagName>]... [--out <file>] [--dir <path>]

Options:
  --map <dim>=<tag>   Override the default tag for a dimension (repeatable).
  --out <file>        Where to write the tag plan (default:
                      ".workspec/tagplans/<period>.yaml"). Its filename stem
                      (minus ".yaml") becomes the plan's slug, so it must be a
                      valid slug: lowercase alphanumeric segments separated by
                      single hyphens.
  --dir <path>        Directory to scan (default: current directory).

Requires exactly one inventory and one attribution in scope. Every declared
dimension defaults to tag "fs-<kebab-case dimension id>" (e.g. costType ->
fs-cost-type); --map overrides individual dimensions. Prints
"+add · ~change · -remove · noop" counts.
`;

const APPLY_HELP = `workspec-cost apply — apply (or dry-run) a tag plan

Usage:
  workspec-cost apply <plan-file> [--dry-run] [--dir <path>]

Options:
  --dry-run      Simulate only — no live resource is mutated.
  --dir <path>   Directory to scan (default: current directory).

Refuses (exit 1, no writes) when the plan's baseline inventory can't be found,
or when the provider's live state has drifted from that baseline since the
plan was computed — re-stocktake and re-plan in that case.
`;

function issueDiagnostic(ref: string, issue: ParseIssue): string {
  const loc = issue.line > 0 ? `${issue.line}:${issue.col}` : '1:1';
  const path = issue.path.length > 0 ? ` (${issue.path})` : '';
  return `${ref}:${loc}: error: ${issue.message}${path}\n`;
}

/** Prints located diagnostics for a failed read (mirrors `formatDiagnostic`'s "parse-error"/"read-error" shape). */
function reportReadError(ref: string, error: unknown, io: CliIO): void {
  if (error instanceof ArtifactValidationError) {
    for (const issue of error.issues) io.err(issueDiagnostic(ref, issue));
    return;
  }
  io.err(`${ref}:1:1: error: ${(error as Error).message}\n`);
}

// ── stocktake ────────────────────────────────────────────────────────────

async function runStocktake(argv: string[], io: CliIO, deps: RunDeps | undefined): Promise<number> {
  let values: {
    subscription?: string[];
    name?: string;
    period?: string;
    dir?: string;
    help?: boolean;
  };
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        subscription: { type: 'string', multiple: true },
        name: { type: 'string' },
        period: { type: 'string' },
        dir: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
      allowPositionals: false,
    }));
  } catch (error) {
    io.err(`stocktake: ${(error as Error).message}\n`);
    return 2;
  }
  if (values.help === true) {
    io.out(STOCKTAKE_HELP);
    return 0;
  }

  const dir = values.dir ?? process.cwd();
  const repository = resolveRepository(deps, dir);
  const provider = resolveProvider(deps);
  const clock = resolveClock(deps);

  const outcome = await runStocktakeCore(
    {
      subscriptions: values.subscription ?? [],
      ...(values.name !== undefined ? { name: values.name } : {}),
      ...(values.period !== undefined ? { period: values.period } : {}),
    },
    { repository, provider, clock },
  );

  switch (outcome.kind) {
    case 'usage-error':
      io.err(`stocktake: ${outcome.message}\n`);
      return 2;
    case 'write-error':
      io.err(`stocktake: ${outcome.message}\n`);
      return 2;
    case 'ok':
      if (outcome.previousStatus === 'unparseable') {
        io.err(
          `stocktake: previous inventory at ${outcome.inventoryRef} could not be parsed — drift summary skipped\n`,
        );
      }
      if (outcome.driftSummary !== undefined) {
        io.err(`stocktake: ${outcome.driftSummary}\n`);
      }
      io.err(`stocktake: wrote ${outcome.inventoryRef}, ${outcome.spendRef}\n`);
      return 0;
  }
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

  const invRefs = await repository.listInventories();
  const spendRefs = await repository.listSpends();
  const attrRefs = await repository.listAttributions();
  const planRefs = await repository.listTagPlans();
  const fileCount = invRefs.length + spendRefs.length + attrRefs.length + planRefs.length;
  // No early return on an empty/no-artifact dir — fall through to the same
  // summary line every other outcome prints (mirrors decision-studio's
  // validate, which never special-cases zero files either).

  const diagnostics = await collectDiagnostics(repository);
  for (const diagnostic of diagnostics) io.err(formatDiagnostic(diagnostic));

  if (values.json === true) io.out(`${JSON.stringify(diagnostics)}\n`);

  const errorCount = diagnostics.filter((d) => d.severity === 'error').length;
  const warningCount = diagnostics.filter((d) => d.severity === 'warning').length;

  if (errorCount === 0) {
    const suffix = warningCount > 0 ? `, ${warningCount} warning(s)` : '';
    io.err(`validate: ${fileCount} artifact(s) OK${suffix}\n`);
    return 0;
  }
  io.err(`validate: ${errorCount} error(s), ${warningCount} warning(s) across ${fileCount} artifact(s)\n`);
  return 1;
}

// ── report ───────────────────────────────────────────────────────────────

async function runReport(argv: string[], io: CliIO, deps: RunDeps | undefined): Promise<number> {
  let values: { by?: string; format?: string; dir?: string; help?: boolean };
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        by: { type: 'string' },
        format: { type: 'string' },
        dir: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
      allowPositionals: false,
    }));
  } catch (error) {
    io.err(`report: ${(error as Error).message}\n`);
    return 2;
  }
  if (values.help === true) {
    io.out(REPORT_HELP);
    return 0;
  }

  const dir = values.dir ?? process.cwd();
  const repository = resolveRepository(deps, dir);

  const outcome = await computeReport(repository, { ...(values.by !== undefined ? { by: values.by } : {}) });
  switch (outcome.kind) {
    case 'usage-error':
      io.err(`report: ${outcome.message}\n`);
      return 2;
    case 'read-error':
      reportReadError(outcome.ref, outcome.error, io);
      return 1;
    case 'internal-error':
      io.err(`report: ${outcome.message}\n`);
      return 1;
    case 'ok':
      break;
  }

  for (const warning of outcome.warnings) {
    io.err(`report: warning: [${warning.code}] ${warning.message}\n`);
  }

  const rendered = renderReport(values.format, {
    dimensionId: outcome.dimensionId,
    dimensionLabel: outcome.dimensionLabel,
    primaryCoverage: outcome.primaryCoverage,
    coverage: outcome.coverage,
    rollup: outcome.rollup,
    totals: outcome.totals,
  });
  if ('usageError' in rendered) {
    io.err(`report: ${rendered.usageError}\n`);
    return 2;
  }
  io.out(rendered.text);
  return 0;
}

// ── plan ─────────────────────────────────────────────────────────────────

async function runPlan(argv: string[], io: CliIO, deps: RunDeps | undefined): Promise<number> {
  let values: { map?: string[]; out?: string; dir?: string; help?: boolean };
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        map: { type: 'string', multiple: true },
        out: { type: 'string' },
        dir: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
      allowPositionals: false,
    }));
  } catch (error) {
    io.err(`plan: ${(error as Error).message}\n`);
    return 2;
  }
  if (values.help === true) {
    io.out(PLAN_HELP);
    return 0;
  }

  const dir = values.dir ?? process.cwd();
  const repository = resolveRepository(deps, dir);

  const outcome = await computePlan(repository, {
    ...(values.map !== undefined ? { map: values.map } : {}),
    ...(values.out !== undefined ? { out: values.out } : {}),
  });

  switch (outcome.kind) {
    case 'usage-error':
      io.err(`plan: ${outcome.message}\n`);
      return 2;
    case 'read-error':
      reportReadError(outcome.ref, outcome.error, io);
      return 1;
    case 'internal-error':
      io.err(`plan: ${outcome.message}\n`);
      return 1;
    case 'nothing-attributable':
      io.err(`plan: ${outcome.message}\n`);
      return 1;
    case 'write-error':
      io.err(`plan: ${outcome.message}\n`);
      return 2;
    case 'ok': {
      const { counts } = outcome;
      io.err(
        `plan: +${counts.add} add · ~${counts.change} change · −${counts.remove} remove · ${counts.noop} noop\n`,
      );
      io.err(`plan: wrote ${outcome.outRef}\n`);
      return 0;
    }
  }
}

// ── apply ────────────────────────────────────────────────────────────────

function driftMarker(kind: Drift['kind']): string {
  switch (kind) {
    case 'resource-appeared':
      return '+';
    case 'resource-disappeared':
      return '−';
    case 'tags-changed':
      return '~';
  }
}

function driftLabel(kind: Drift['kind']): string {
  switch (kind) {
    case 'resource-appeared':
      return 'appeared out-of-band';
    case 'resource-disappeared':
      return 'disappeared out-of-band';
    case 'tags-changed':
      return 'tags changed out-of-band';
  }
}

async function runApply(argv: string[], io: CliIO, deps: RunDeps | undefined): Promise<number> {
  let values: { 'dry-run'?: boolean; dir?: string; help?: boolean };
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({
      args: argv,
      options: {
        'dry-run': { type: 'boolean' },
        dir: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
      allowPositionals: true,
    }));
  } catch (error) {
    io.err(`apply: ${(error as Error).message}\n`);
    return 2;
  }
  if (values.help === true) {
    io.out(APPLY_HELP);
    return 0;
  }
  if (positionals.length !== 1) {
    io.err('apply: expected exactly one <plan-file> argument\n');
    return 2;
  }
  const planRef = positionals[0];
  if (planRef === undefined) {
    io.err('apply: expected exactly one <plan-file> argument\n');
    return 2;
  }

  const dir = values.dir ?? process.cwd();
  const repository = resolveRepository(deps, dir);
  const provider = resolveProvider(deps);
  const dryRun = values['dry-run'] === true;

  const outcome = await computeApply({ repository, provider }, { planRef, dryRun });

  switch (outcome.kind) {
    case 'read-error':
      reportReadError(outcome.ref, outcome.error, io);
      return 1;
    case 'no-baseline':
      io.err(`apply: ${outcome.message}\n`);
      return 1;
    case 'multiple-baseline':
      io.err(`apply: refusing — ${outcome.message}\n`);
      return 1;
    case 'drift': {
      io.err(`apply: refusing — ${outcome.message}:\n`);
      for (const drift of outcome.drifts) {
        io.err(`  ${driftMarker(drift.kind)} ${drift.resourceId} ${driftLabel(drift.kind)}\n`);
      }
      io.err('apply: re-stocktake and re-plan before applying\n');
      return 1;
    }
    case 'ok': {
      const { result } = outcome;
      for (const entry of result.results) {
        const displayName = outcome.nameById[entry.resourceId] ?? entry.resourceId;
        if (entry.ok) {
          io.err(`✓ ${displayName} ${entry.tag} ${entry.action}\n`);
        } else {
          io.err(`✗ ${displayName} ${entry.tag} ${entry.action}: ${entry.error ?? 'failed'}\n`);
        }
      }
      io.err(
        `apply: ${result.applied} applied · ${result.skippedNoop} noop · ${result.failed} failed${outcome.dryRun ? ' (dry run)' : ''}\n`,
      );
      return result.failed > 0 ? 1 : 0;
    }
  }
}

// ── dispatch ─────────────────────────────────────────────────────────────

/**
 * The CLI entry point. Parses `argv` (already stripped of `node` + script),
 * dispatches to a subcommand, and resolves to the process exit code. Writes
 * through `io` (defaults to the real stdout/stderr). `deps` injects test
 * doubles for the repository/provider/clock a command would otherwise build
 * itself.
 */
export async function run(argv: string[], io: CliIO = defaultIO, deps?: RunDeps): Promise<number> {
  const [command, ...rest] = argv;
  switch (command) {
    case 'stocktake':
      return runStocktake(rest, io, deps);
    case 'validate':
      return runValidate(rest, io, deps);
    case 'report':
      return runReport(rest, io, deps);
    case 'plan':
      return runPlan(rest, io, deps);
    case 'apply':
      return runApply(rest, io, deps);
    case 'serve':
      return runServe(rest, io);
    case 'mcp':
      return runMcp(rest, io);
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      io.out(HELP);
      return 0;
    default:
      io.err(`workspec-cost: unknown command "${command}"\n`);
      io.out(HELP);
      return 2;
  }
}
