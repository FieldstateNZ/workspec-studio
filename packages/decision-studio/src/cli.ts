// The Decision Studio CLI — a small, extensible subcommand skeleton. S4 adds
// `serve` as the default; for now it ships `validate` and `render-adr`.
//
// `run(argv, io)` is the testable entry point: it returns a process exit code
// and writes through an injectable IO (defaulting to the real streams), so tests
// can drive it and capture output without spawning a process. `bin.ts` is the
// only thing that touches `process`.

import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { Catalog, Decision, ParseIssue } from '@workspec/decision-schema';
import { buildAdrModel, renderAdrMarkdown } from '@workspec/decision-engine';
import { collectDiagnostics } from './collect-diagnostics.js';
import { formatDiagnostic } from './format-diagnostic.js';
import { ArtifactValidationError, FsRepository } from './fs-repository.js';
import { runMcp } from './run-mcp.js';
import { runServe } from './serve.js';

/** Injectable IO. `out` is reserved for artifacts (e.g. ADR markdown); `err` for diagnostics. */
export interface CliIO {
  out(text: string): void;
  err(text: string): void;
}

const defaultIO: CliIO = {
  out: (text) => process.stdout.write(text),
  err: (text) => process.stderr.write(text),
};

const HELP = `workspec-decisions — costed architecture decisions from your working tree

Usage:
  workspec-decisions [command] [options]

Commands:
  serve        Run the localhost host shell over a directory (DEFAULT command).
  validate     Validate every decision + catalog under a directory (CI-friendly).
  render-adr   Render a decision to a deterministic Markdown ADR.
  mcp          Run the decisions MCP server over stdio.

With no command, "serve" runs. Run "workspec-decisions <command> --help" for
command options.
`;

const VALIDATE_HELP = `workspec-decisions validate — validate all artifacts under a directory

Usage:
  workspec-decisions validate [--dir <path>] [--json]

Options:
  --dir <path>   Directory to scan (default: current directory).
  --json         Also print the diagnostics array as JSON to stdout.

Zod-validates every artifact under .workspec/decisions and .workspec/catalogs,
then checks each decision's authored SKU-line references against its catalog. Dangling
references inside levers are reported as (non-fatal) warnings. Prints
"file:line:col: message" diagnostics and exits non-zero on any error.
`;

// Re-exported for existing external importers of `ValidateDiagnostic` from
// this module; the type itself now lives with `collectDiagnostics` in
// `collect-diagnostics.ts`, its actual producer.
export type { ValidateDiagnostic } from './collect-diagnostics.js';

const RENDER_HELP = `workspec-decisions render-adr — render a decision as a Markdown ADR

Usage:
  workspec-decisions render-adr [--dir <path>] [--decision <ref|slug>] [--out <file>]

Options:
  --dir <path>          Directory to scan (default: current directory).
  --decision <ref|slug> Which decision to render (required if more than one).
  --out <file>          Write the ADR here (default: stdout).

The output is a GENERATED ARTIFACT — deterministic Markdown derived from the
YAML. It is never committed (the repo's .gitignore ignores *.adr.md).
`;

function issueDiagnostic(ref: string, issue: ParseIssue): string {
  const loc = issue.line > 0 ? `${issue.line}:${issue.col}` : '1:1';
  const path = issue.path.length > 0 ? ` (${issue.path})` : '';
  return `${ref}:${loc}: error: ${issue.message}${path}\n`;
}

function reportReadError(ref: string, error: unknown, io: CliIO): void {
  if (error instanceof ArtifactValidationError) {
    for (const issue of error.issues) io.err(issueDiagnostic(ref, issue));
  } else {
    io.err(`${ref}:1:1: error: ${(error as Error).message}\n`);
  }
}

async function runValidate(argv: string[], io: CliIO): Promise<number> {
  let dir: string;
  let json: boolean;
  try {
    const { values } = parseArgs({
      args: argv,
      options: {
        dir: { type: 'string' },
        json: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
      },
      allowPositionals: false,
    });
    if (values.help === true) {
      io.out(VALIDATE_HELP);
      return 0;
    }
    dir = values.dir ?? process.cwd();
    json = values.json === true;
  } catch (error) {
    io.err(`validate: ${(error as Error).message}\n`);
    return 2;
  }

  const repo = new FsRepository(dir);
  // `fileCount` (every discovered artifact, valid or not) is independent of
  // the diagnostics list (which only has entries for problems), so it's
  // computed from the same discovery `collectDiagnostics` uses internally —
  // a second, cheap directory walk, not a second validation pass.
  const [catalogs, decisions, diagnostics] = await Promise.all([
    repo.listCatalogs(),
    repo.listDecisions(),
    collectDiagnostics(repo),
  ]);
  const fileCount = catalogs.length + decisions.length;

  for (const diagnostic of diagnostics) io.err(formatDiagnostic(diagnostic));

  if (json) io.out(`${JSON.stringify(diagnostics)}\n`);

  const errorCount = diagnostics.filter((d) => d.severity === 'error').length;
  const warningCount = diagnostics.filter((d) => d.severity === 'warning').length;

  if (errorCount === 0) {
    const suffix = warningCount > 0 ? `, ${warningCount} warning(s)` : '';
    io.err(`validate: ${fileCount} artifact(s) OK${suffix}\n`);
    return 0;
  }
  io.err(
    `validate: ${errorCount} error(s), ${warningCount} warning(s) across ${fileCount} artifact(s)\n`,
  );
  return 1;
}

async function runRenderAdr(argv: string[], io: CliIO): Promise<number> {
  let values: { dir?: string; decision?: string; out?: string; help?: boolean };
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        dir: { type: 'string' },
        decision: { type: 'string' },
        out: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
      allowPositionals: false,
    }));
  } catch (error) {
    io.err(`render-adr: ${(error as Error).message}\n`);
    return 2;
  }
  if (values.help === true) {
    io.out(RENDER_HELP);
    return 0;
  }

  const dir = values.dir ?? process.cwd();
  const repo = new FsRepository(dir);

  const decisions = await repo.listDecisions();
  if (decisions.length === 0) {
    io.err(`render-adr: no decisions found under ${dir}\n`);
    return 1;
  }

  let ref: string;
  let slug: string;
  if (values.decision !== undefined) {
    const wanted = values.decision;
    const found = decisions.find((d) => d.ref === wanted || d.slug === wanted);
    if (found === undefined) {
      io.err(`render-adr: no decision matching "${wanted}"\n`);
      return 1;
    }
    ref = found.ref;
    slug = found.slug ?? wanted;
  } else if (decisions.length === 1 && decisions[0] !== undefined) {
    ref = decisions[0].ref;
    slug = decisions[0].slug ?? ref;
  } else {
    io.err('render-adr: multiple decisions found; pass --decision <ref|slug>:\n');
    for (const d of decisions) io.err(`  ${d.ref} (${d.slug})\n`);
    return 1;
  }

  let decision: Decision;
  try {
    decision = await repo.readDecision(ref);
  } catch (error) {
    reportReadError(ref, error, io);
    return 1;
  }

  const catalogRef = repo.resolveCatalogRef(ref, decision);
  let catalog: Catalog;
  try {
    catalog = await repo.readCatalog(catalogRef);
  } catch (error) {
    reportReadError(catalogRef, error, io);
    return 1;
  }

  const markdown = renderAdrMarkdown(buildAdrModel(decision, catalog, slug));
  if (values.out !== undefined) {
    const outPath = resolve(process.cwd(), values.out);
    await writeFile(outPath, markdown, 'utf8');
    io.err(`render-adr: wrote ${outPath}\n`);
  } else {
    io.out(markdown);
  }
  return 0;
}

/**
 * The CLI entry point. Parses `argv` (already stripped of `node` + script),
 * dispatches to a subcommand, and resolves to the process exit code. Writes
 * through `io` (defaults to the real stdout/stderr).
 */
export async function run(argv: string[], io: CliIO = defaultIO): Promise<number> {
  const [command, ...rest] = argv;
  switch (command) {
    case 'serve':
      return runServe(rest, io);
    case 'validate':
      return runValidate(rest, io);
    case 'render-adr':
      return runRenderAdr(rest, io);
    case 'mcp':
      return runMcp(rest, io);
    case undefined:
      // No subcommand → start the host (the default command).
      return runServe(rest, io);
    case 'help':
    case '--help':
    case '-h':
      io.out(HELP);
      return 0;
    default:
      io.err(`workspec-decisions: unknown command "${command}"\n`);
      io.out(HELP);
      return 2;
  }
}
