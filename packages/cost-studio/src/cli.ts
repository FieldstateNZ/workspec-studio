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
import { FILE_EXTENSION, Slug, slugFromPath } from '@workspec/schema-core';
import { compareResourceIds, typeDirectoryFor } from '@workspec/cost-schema';
import type {
  Attribution,
  CostRepositoryPort,
  Inventory,
  InventoryResourceType,
  ParseIssue,
  Spend,
  TagPlan,
  TagPlanEntryType,
} from '@workspec/cost-schema';
import { attribute, buildTagPlan, resolveAttribution } from '@workspec/cost-engine';
import type { AttributeResult, Coverage, Rollup, TagMapping } from '@workspec/cost-engine';
import { computeDriftReport } from '@workspec/cost-provider';
import type {
  CloudProviderPort,
  Drift,
  DriftReport,
  DriftableResource,
  ProviderScope,
} from '@workspec/cost-provider';
import { createAzureProvider } from '@workspec/cost-provider-azure';
import { ArtifactValidationError, FsRepository } from './fs-repository.js';
import { runServe } from './serve.js';

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

/** One machine-readable validate finding — mirrors `@workspec/c4-model`'s `C4Diagnostic` shape. */
export interface ValidateDiagnostic {
  readonly severity: 'error' | 'warning';
  readonly code: string;
  readonly message: string;
  /** Ref (repo-relative path) of the artifact this diagnostic is about. */
  readonly file: string;
  /** 1-based source line inside `file`, when known. */
  readonly line?: number;
  /** 1-based source column, present only alongside `line`. */
  readonly col?: number;
}

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

/**
 * Prints located diagnostics for a failed read; returns the number of errors
 * reported. When `diagnostics` is given, also appends a machine-readable
 * `ValidateDiagnostic` per issue (used by `validate --json`; other callers
 * omit it and just get the printed text + count).
 */
function reportReadError(
  ref: string,
  error: unknown,
  io: CliIO,
  diagnostics?: ValidateDiagnostic[],
): number {
  if (error instanceof ArtifactValidationError) {
    for (const issue of error.issues) {
      io.err(issueDiagnostic(ref, issue));
      diagnostics?.push({
        severity: 'error',
        code: 'parse-error',
        message: issue.message,
        file: ref,
        line: issue.line,
        col: issue.col,
      });
    }
    return error.issues.length;
  }
  const message = (error as Error).message;
  io.err(`${ref}:1:1: error: ${message}\n`);
  diagnostics?.push({
    severity: 'error',
    code: 'read-error',
    message,
    file: ref,
    line: 1,
    col: 1,
  });
  return 1;
}

// ── stocktake ────────────────────────────────────────────────────────────

function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

/** Builds the `{id -> DriftableResource}` map `computeDriftReport` expects, via the return-type boundary (mirrors `@workspec/cost-provider`'s own `asDriftable`). */
function asDriftable(resources: readonly InventoryResourceType[]): ReadonlyMap<string, DriftableResource> {
  return new Map(resources.map((r) => [r.id, r]));
}

function inventoryDrift(oldInventory: Inventory, newInventory: Inventory): DriftReport {
  const oldMap = asDriftable(oldInventory.spec.resources);
  const newMap = asDriftable(newInventory.spec.resources);
  const targetIds = [...new Set([...oldMap.keys(), ...newMap.keys()])].sort(compareResourceIds);
  return computeDriftReport(targetIds, oldMap, newMap);
}

function driftSummary(report: DriftReport): string {
  if (report.inSync) return 'no drift';
  const appeared = report.drifts.filter((d) => d.kind === 'resource-appeared').length;
  const disappeared = report.drifts.filter((d) => d.kind === 'resource-disappeared').length;
  const tagsChanged = report.drifts.filter((d) => d.kind === 'tags-changed').length;
  const total = report.drifts.length;
  const word = total === 1 ? 'drift' : 'drifts';
  return `${total} ${word}: +${appeared} appeared · −${disappeared} disappeared · ~${tagsChanged} tags changed`;
}

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

  const subscriptions = values.subscription ?? [];
  if (subscriptions.length === 0) {
    io.err('stocktake: at least one --subscription is required\n');
    return 2;
  }
  if (values.period !== undefined && !/^\d{4}-(0[1-9]|1[0-2])$/.test(values.period)) {
    io.err(`stocktake: --period must be an ISO month "YYYY-MM", got "${values.period}"\n`);
    return 2;
  }

  const dir = values.dir ?? process.cwd();
  const repository = resolveRepository(deps, dir);
  const provider = resolveProvider(deps);
  const clock = resolveClock(deps);

  const name = values.name ?? 'estate';
  // Validate the slug EARLY — before touching the provider at all — so a bad
  // --name fails fast with a clean usage error instead of paying for a
  // provider round-trip only to have the write reject at the very end. --name
  // becomes the filename stem (`.workspec/inventories/<name>.yaml`), so it
  // must already be a valid slug, not just any old identifier.
  const nameCheck = Slug.safeParse(name);
  if (!nameCheck.success) {
    io.err(
      `stocktake: invalid --name "${name}": ${nameCheck.error.issues[0]?.message ?? 'must be a valid slug'}\n`,
    );
    return 2;
  }
  const period = values.period ?? monthOf(clock());
  const scope: ProviderScope = { subscriptions };

  const inventoryRef = `${typeDirectoryFor('Inventory')}/${name}${FILE_EXTENSION}`;
  const spendSlug = `${name}-${period}`;
  const spendRef = `${typeDirectoryFor('Spend')}/${spendSlug}${FILE_EXTENSION}`;

  let oldInventory: Inventory | undefined;
  try {
    oldInventory = await repository.readInventory(inventoryRef);
  } catch (error) {
    oldInventory = undefined;
    if (error instanceof ArtifactValidationError) {
      io.err(`stocktake: previous inventory at ${inventoryRef} could not be parsed — drift summary skipped\n`);
    }
  }

  const fetchedInventory = await provider.fetchInventory(scope);
  const newInventory: Inventory = { ...fetchedInventory, metadata: { slug: name } };

  const fetchedSpend = await provider.fetchSpend(scope, period);
  const newSpend: Spend = { ...fetchedSpend, metadata: { slug: spendSlug } };

  if (oldInventory !== undefined) {
    io.err(`stocktake: ${driftSummary(inventoryDrift(oldInventory, newInventory))}\n`);
  }

  // Backstop: the name check above should catch every invalid --name before
  // we get here, but a repository validation rejection must never escape
  // run() as an unhandled promise rejection (bin.ts would degrade it to a
  // generic exit 1) — wrap the writes and turn any failure into a clean exit.
  try {
    await repository.writeInventory(inventoryRef, newInventory);
    await repository.writeSpend(spendRef, newSpend);
  } catch (error) {
    io.err(`stocktake: ${(error as Error).message}\n`);
    return 2;
  }
  io.err(`stocktake: wrote ${inventoryRef}, ${spendRef}\n`);
  return 0;
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

  let errorCount = 0;
  let warningCount = 0;
  const diagnostics: ValidateDiagnostic[] = [];

  const validInventories: { ref: string; data: Inventory }[] = [];
  for (const { ref } of invRefs) {
    try {
      validInventories.push({ ref, data: await repository.readInventory(ref) });
    } catch (error) {
      errorCount += reportReadError(ref, error, io, diagnostics);
    }
  }

  const validSpends: Spend[] = [];
  for (const { ref } of spendRefs) {
    try {
      validSpends.push(await repository.readSpend(ref));
    } catch (error) {
      errorCount += reportReadError(ref, error, io, diagnostics);
    }
  }

  const validAttributions: { ref: string; data: Attribution }[] = [];
  for (const { ref } of attrRefs) {
    try {
      validAttributions.push({ ref, data: await repository.readAttribution(ref) });
    } catch (error) {
      errorCount += reportReadError(ref, error, io, diagnostics);
    }
  }

  for (const { ref } of planRefs) {
    try {
      await repository.readTagPlan(ref);
    } catch (error) {
      errorCount += reportReadError(ref, error, io, diagnostics);
    }
  }

  if (validInventories.length >= 1 && validAttributions.length >= 1) {
    for (const inv of validInventories) {
      for (const attr of validAttributions) {
        const result = attribute(inv.data, validSpends, attr.data);
        const suffix = validInventories.length > 1 ? ` (inventory: ${inv.ref})` : '';
        for (const diagnostic of result.diagnostics) {
          io.err(`${attr.ref}: warning: [${diagnostic.code}] ${diagnostic.message}${suffix}\n`);
          diagnostics.push({
            severity: 'warning',
            code: diagnostic.code,
            message: `${diagnostic.message}${suffix}`,
            file: attr.ref,
          });
          warningCount += 1;
        }
      }
    }
  }

  if (values.json === true) io.out(`${JSON.stringify(diagnostics)}\n`);

  if (errorCount === 0) {
    const suffix = warningCount > 0 ? `, ${warningCount} warning(s)` : '';
    io.err(`validate: ${fileCount} artifact(s) OK${suffix}\n`);
    return 0;
  }
  io.err(`validate: ${errorCount} error(s), ${warningCount} warning(s) across ${fileCount} artifact(s)\n`);
  return 1;
}

// ── report ───────────────────────────────────────────────────────────────

function formatMoney(amount: number): string {
  return Math.round(amount).toLocaleString('en-US');
}

interface RollupRow {
  key: string;
  amount: number;
  share: number;
}

function rollupRows(rollup: Rollup, totalSpend: number): RollupRow[] {
  const unattributed = rollup.buckets.find((b) => b.key === 'unattributed');
  const rest = rollup.buckets
    .filter((b) => b.key !== 'unattributed')
    .sort((a, b) => (b.amount !== a.amount ? b.amount - a.amount : a.key < b.key ? -1 : 1));
  const ordered = unattributed !== undefined ? [...rest, unattributed] : rest;
  return ordered.map((b) => ({
    key: b.key,
    amount: b.amount,
    share: totalSpend !== 0 ? b.amount / totalSpend : 0,
  }));
}

function renderHeadline(coverage: Coverage): string {
  const pct = (coverage.ratio * 100).toFixed(1);
  // Name the dimension this coverage number refers to — always the primary
  // dimension — so "--by costType" output can't be misread as costType's
  // own coverage (the headline is always about the primary dimension).
  return `coverage[${coverage.dimensionId}] ${pct}% · $${formatMoney(coverage.unattributedSpend)}/mo unattributed · ${coverage.unattributedCount} resources`;
}

function renderTable(dimensionLabel: string, rows: RollupRow[]): string {
  const amountStrs = rows.map((r) => formatMoney(r.amount));
  const shareStrs = rows.map((r) => `${(r.share * 100).toFixed(1)}%`);
  const keyWidth = Math.max(dimensionLabel.length, ...rows.map((r) => r.key.length));
  const amountWidth = Math.max('$/mo'.length, ...amountStrs.map((s) => s.length));
  const shareWidth = Math.max('share%'.length, ...shareStrs.map((s) => s.length));

  const lines = [
    `${dimensionLabel.padEnd(keyWidth)}  ${'$/mo'.padStart(amountWidth)}  ${'share%'.padStart(shareWidth)}`,
  ];
  rows.forEach((r, i) => {
    const amountStr = amountStrs[i] ?? '';
    const shareStr = shareStrs[i] ?? '';
    lines.push(`${r.key.padEnd(keyWidth)}  ${amountStr.padStart(amountWidth)}  ${shareStr.padStart(shareWidth)}`);
  });
  return `${lines.join('\n')}\n`;
}

function csvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function renderCsv(dimensionId: string, rows: RollupRow[]): string {
  const lines = ['dimension,value,amount,share'];
  for (const row of rows) {
    const amount = Math.round(row.amount * 100) / 100;
    const share = Math.round(row.share * 100 * 100) / 100;
    lines.push(`${csvField(dimensionId)},${csvField(row.key)},${amount},${share}`);
  }
  return `${lines.join('\n')}\n`;
}

const REPORT_DIAGNOSTIC_CODES = new Set(['mixed-currency', 'orphan-spend-row']);

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

  const invRefs = await repository.listInventories();
  const attrRefs = await repository.listAttributions();
  if (invRefs.length !== 1) {
    io.err(`report: expected exactly 1 inventory, found ${invRefs.length}\n`);
    return 2;
  }
  if (attrRefs.length !== 1) {
    io.err(`report: expected exactly 1 attribution, found ${attrRefs.length}\n`);
    return 2;
  }
  const invRef = invRefs[0];
  const attrRef = attrRefs[0];
  if (invRef === undefined || attrRef === undefined) {
    io.err('report: internal error resolving artifact refs\n');
    return 1;
  }

  let inventory: Inventory;
  let attribution: Attribution;
  try {
    inventory = await repository.readInventory(invRef.ref);
  } catch (error) {
    reportReadError(invRef.ref, error, io);
    return 1;
  }
  try {
    attribution = await repository.readAttribution(attrRef.ref);
  } catch (error) {
    reportReadError(attrRef.ref, error, io);
    return 1;
  }

  const spendRefs = await repository.listSpends();
  const spends: Spend[] = [];
  for (const { ref } of spendRefs) {
    try {
      spends.push(await repository.readSpend(ref));
    } catch (error) {
      reportReadError(ref, error, io);
      return 1;
    }
  }

  const result: AttributeResult = attribute(inventory, spends, attribution);

  const by = values.by ?? result.primaryDimensionId;
  const dimension = attribution.spec.dimensions.find((d) => d.id === by);
  if (dimension === undefined) {
    io.err(`report: unknown dimension "${by}" (not declared in the attribution)\n`);
    return 2;
  }

  const primaryCoverage = result.coverage.find((c) => c.isPrimary);
  const rollup = result.rollups.find((r) => r.dimensionId === by);
  if (primaryCoverage === undefined || rollup === undefined) {
    io.err('report: internal error computing coverage/rollup\n');
    return 1;
  }

  for (const diagnostic of result.diagnostics) {
    if (REPORT_DIAGNOSTIC_CODES.has(diagnostic.code)) {
      io.err(`report: warning: [${diagnostic.code}] ${diagnostic.message}\n`);
    }
  }

  const format = values.format ?? 'table';
  const rows = rollupRows(rollup, result.totals.inventorySpend);
  switch (format) {
    case 'table':
      io.out(`${renderHeadline(primaryCoverage)}\n\n${renderTable(dimension.label, rows)}`);
      return 0;
    case 'json':
      io.out(
        `${JSON.stringify(
          { rollup, coverage: result.coverage, totals: result.totals },
          null,
          2,
        )}\n`,
      );
      return 0;
    case 'csv':
      io.out(renderCsv(dimension.id, rows));
      return 0;
    default:
      io.err(`report: unknown --format "${format}" (expected table, json, or csv)\n`);
      return 2;
  }
}

// ── plan ─────────────────────────────────────────────────────────────────

function kebabCase(id: string): string {
  return id
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/_/g, '-')
    .toLowerCase();
}

function defaultTagMapping(attribution: Attribution): TagMapping {
  const mapping: TagMapping = {};
  for (const dimension of attribution.spec.dimensions) {
    mapping[dimension.id] = `fs-${kebabCase(dimension.id)}`;
  }
  return mapping;
}

function parseMapArg(raw: string): [string, string] {
  const eq = raw.indexOf('=');
  if (eq <= 0 || eq === raw.length - 1) {
    throw new Error(`invalid --map "${raw}" (expected "dimensionId=tagName")`);
  }
  return [raw.slice(0, eq), raw.slice(eq + 1)];
}

function latestPeriod(spends: readonly Spend[], inventory: Inventory): string {
  const periods = spends.flatMap((s) => s.spec.rows.map((r) => r.period)).sort();
  const latest = periods.at(-1);
  return latest ?? monthOf(inventory.spec.asOf);
}

interface ActionCounts {
  add: number;
  change: number;
  remove: number;
  noop: number;
}

function countActions(entries: readonly TagPlanEntryType[]): ActionCounts {
  const counts: ActionCounts = { add: 0, change: 0, remove: 0, noop: 0 };
  for (const entry of entries) {
    counts[entry.action] += 1;
  }
  return counts;
}

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

  // Validate the tag plan's slug EARLY — right after parsing flags, before
  // any repository reads — so a bad --out fails fast with a clean usage
  // error instead of a repository validation rejection surfacing only at the
  // write, at the very end of the command. --out's filename stem becomes
  // `metadata.slug`, so it must both end in ".yaml" and be a valid slug.
  if (values.out !== undefined) {
    const outSlug = slugFromPath(values.out);
    if (outSlug === null) {
      io.err(`plan: invalid --out "${values.out}": must end in "${FILE_EXTENSION}"\n`);
      return 2;
    }
    const outSlugCheck = Slug.safeParse(outSlug);
    if (!outSlugCheck.success) {
      io.err(
        `plan: invalid --out "${values.out}": ${outSlugCheck.error.issues[0]?.message ?? 'must be a valid slug'}\n`,
      );
      return 2;
    }
  }

  const dir = values.dir ?? process.cwd();
  const repository = resolveRepository(deps, dir);

  const invRefs = await repository.listInventories();
  const attrRefs = await repository.listAttributions();
  if (invRefs.length !== 1) {
    io.err(`plan: expected exactly 1 inventory, found ${invRefs.length}\n`);
    return 2;
  }
  if (attrRefs.length !== 1) {
    io.err(`plan: expected exactly 1 attribution, found ${attrRefs.length}\n`);
    return 2;
  }
  const invRef = invRefs[0];
  const attrRef = attrRefs[0];
  if (invRef === undefined || attrRef === undefined) {
    io.err('plan: internal error resolving artifact refs\n');
    return 1;
  }

  let inventory: Inventory;
  let attribution: Attribution;
  try {
    inventory = await repository.readInventory(invRef.ref);
  } catch (error) {
    reportReadError(invRef.ref, error, io);
    return 1;
  }
  try {
    attribution = await repository.readAttribution(attrRef.ref);
  } catch (error) {
    reportReadError(attrRef.ref, error, io);
    return 1;
  }

  const dimensionIds = new Set(attribution.spec.dimensions.map((d) => d.id));
  const tagMapping = defaultTagMapping(attribution);
  for (const raw of values.map ?? []) {
    let dim: string;
    let tag: string;
    try {
      [dim, tag] = parseMapArg(raw);
    } catch (error) {
      io.err(`plan: ${(error as Error).message}\n`);
      return 2;
    }
    if (!dimensionIds.has(dim)) {
      io.err(`plan: unknown dimension "${dim}" in --map (not declared in the attribution)\n`);
      return 2;
    }
    tagMapping[dim] = tag;
  }

  const spendRefs = await repository.listSpends();
  const spends: Spend[] = [];
  for (const { ref } of spendRefs) {
    try {
      spends.push(await repository.readSpend(ref));
    } catch (error) {
      reportReadError(ref, error, io);
      return 1;
    }
  }

  const outRef =
    values.out ?? `${typeDirectoryFor('TagPlan')}/${latestPeriod(spends, inventory)}${FILE_EXTENSION}`;
  const outSlug = slugFromPath(outRef);
  const tagPlan: TagPlan = buildTagPlan(inventory, attribution, tagMapping, {
    ...(outSlug !== null ? { slug: outSlug } : {}),
  });

  const primaryDimension = attribution.spec.dimensions[0];
  if (tagPlan.spec.entries.length === 0 && primaryDimension !== undefined) {
    const { resolutions } = resolveAttribution(inventory, attribution);
    const anyResolved = resolutions.some((r) => r.assignments[primaryDimension.id] !== undefined);
    if (!anyResolved) {
      io.err('plan: no resources are attributable (nothing to tag) — check your attribution rules\n');
      return 1;
    }
  }

  // Backstop: the --out check above should catch every invalid id before we
  // get here, but a repository validation rejection must never escape run()
  // as an unhandled promise rejection — wrap the write and turn any failure
  // into a clean exit instead.
  try {
    await repository.writeTagPlan(outRef, tagPlan);
  } catch (error) {
    io.err(`plan: ${(error as Error).message}\n`);
    return 2;
  }

  const counts = countActions(tagPlan.spec.entries);
  io.err(
    `plan: +${counts.add} add · ~${counts.change} change · −${counts.remove} remove · ${counts.noop} noop\n`,
  );
  io.err(`plan: wrote ${outRef}\n`);
  return 0;
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

  let plan: TagPlan;
  try {
    plan = await repository.readTagPlan(planRef);
  } catch (error) {
    reportReadError(planRef, error, io);
    return 1;
  }

  const invRefs = await repository.listInventories();
  // Collect EVERY inventory whose asOf string-equals the plan's baseline —
  // not just the first by sorted ref. With two (or more) inventories sharing
  // that asOf, silently picking the first can gate against the wrong one in
  // either direction (a stale "in sync" pass, or a spurious drift refusal).
  const matches: { ref: string; inventory: Inventory }[] = [];
  for (const { ref } of invRefs) {
    try {
      const candidate = await repository.readInventory(ref);
      if (candidate.spec.asOf === plan.spec.baselineAsOf) {
        matches.push({ ref, inventory: candidate });
      }
    } catch {
      // An unrelated invalid inventory doesn't block finding the right one.
    }
  }
  if (matches.length === 0) {
    io.err(
      `apply: no inventory found with asOf matching the plan's baseline (${plan.spec.baselineAsOf}) — re-stocktake and re-plan\n`,
    );
    return 1;
  }
  if (matches.length > 1) {
    const refs = matches.map((m) => m.ref).join(', ');
    io.err(
      `apply: refusing — ${matches.length} inventories share the plan's baselineAsOf (${plan.spec.baselineAsOf}): ${refs}; keep exactly one or re-plan\n`,
    );
    return 1;
  }
  const onlyMatch = matches[0];
  if (onlyMatch === undefined) {
    io.err('apply: internal error resolving baseline inventory\n');
    return 1;
  }
  const baseline = onlyMatch.inventory;
  const baselineRef = onlyMatch.ref;

  const plannedResourceIds = [...new Set(plan.spec.entries.map((e) => e.resourceId))].sort(
    compareResourceIds,
  );
  const driftReport = await provider.verifyBaseline(baseline, plannedResourceIds);
  if (!driftReport.inSync) {
    io.err(
      `apply: refusing — live state has drifted from the plan's baseline inventory (${baselineRef ?? ''}):\n`,
    );
    for (const drift of driftReport.drifts) {
      io.err(`  ${driftMarker(drift.kind)} ${drift.resourceId} ${driftLabel(drift.kind)}\n`);
    }
    io.err('apply: re-stocktake and re-plan before applying\n');
    return 1;
  }

  const dryRun = values['dry-run'] === true;
  const applyResult = await provider.applyTags(plan, { dryRun });

  const nameById = new Map(baseline.spec.resources.map((r) => [r.id, r.name]));
  for (const entry of applyResult.results) {
    const displayName = nameById.get(entry.resourceId) ?? entry.resourceId;
    if (entry.ok) {
      io.err(`✓ ${displayName} ${entry.tag} ${entry.action}\n`);
    } else {
      io.err(`✗ ${displayName} ${entry.tag} ${entry.action}: ${entry.error ?? 'failed'}\n`);
    }
  }

  io.err(
    `apply: ${applyResult.applied} applied · ${applyResult.skippedNoop} noop · ${applyResult.failed} failed${dryRun ? ' (dry run)' : ''}\n`,
  );
  return applyResult.failed > 0 ? 1 : 0;
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
