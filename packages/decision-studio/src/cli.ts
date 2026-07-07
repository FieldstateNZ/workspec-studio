// The Decision Studio CLI — a small, extensible subcommand skeleton. S4 adds
// `serve` as the default; for now it ships `validate` and `render-adr`.
//
// `run(argv, io)` is the testable entry point: it returns a process exit code
// and writes through an injectable IO (defaulting to the real streams), so tests
// can drive it and capture output without spawning a process. `bin.ts` is the
// only thing that touches `process`.

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { Catalog, Decision, ParseIssue } from '@workspec/decision-schema';
import { parseCatalogYaml, parseDecisionYaml } from '@workspec/decision-schema';
import { buildAdrModel, renderAdrMarkdown, validateRefs } from '@workspec/decision-engine';
import { ArtifactValidationError, FsRepository } from './fs-repository.js';
import { collectLeverRefWarnings } from './lever-refs.js';
import { makeLocator } from './locate.js';
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

With no command, "serve" runs. Run "workspec-decisions <command> --help" for
command options.
`;

const VALIDATE_HELP = `workspec-decisions validate — validate all artifacts under a directory

Usage:
  workspec-decisions validate [--dir <path>]

Options:
  --dir <path>   Directory to scan (default: current directory).

Zod-validates every *.decision.yaml and *.catalog.yaml, then checks each
decision's authored SKU-line references against its catalog. Dangling
references inside levers are reported as (non-fatal) warnings. Prints
"file:line:col: message" diagnostics and exits non-zero on any error.
`;

const RENDER_HELP = `workspec-decisions render-adr — render a decision as a Markdown ADR

Usage:
  workspec-decisions render-adr [--dir <path>] [--decision <ref|id>] [--out <file>]

Options:
  --dir <path>        Directory to scan (default: current directory).
  --decision <ref|id> Which decision to render (required if more than one).
  --out <file>        Write the ADR here (default: stdout).

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
  try {
    const { values } = parseArgs({
      args: argv,
      options: { dir: { type: 'string' }, help: { type: 'boolean', short: 'h' } },
      allowPositionals: false,
    });
    if (values.help === true) {
      io.out(VALIDATE_HELP);
      return 0;
    }
    dir = values.dir ?? process.cwd();
  } catch (error) {
    io.err(`validate: ${(error as Error).message}\n`);
    return 2;
  }

  const repo = new FsRepository(dir);
  let errorCount = 0;
  let warningCount = 0;
  let fileCount = 0;

  // Catalogs first — validate each independently and cache the valid ones so a
  // decision's ref-check reuses them.
  const catalogCache = new Map<string, Catalog>();
  for (const { ref } of await repo.listCatalogs()) {
    fileCount += 1;
    const parsed = parseCatalogYaml(await readFile(repo.resolve(ref), 'utf8'));
    if (parsed.ok) {
      catalogCache.set(ref, parsed.data);
    } else {
      for (const issue of parsed.errors) {
        io.err(issueDiagnostic(ref, issue));
        errorCount += 1;
      }
    }
  }

  for (const { ref } of await repo.listDecisions()) {
    fileCount += 1;
    const text = await readFile(repo.resolve(ref), 'utf8');
    const parsed = parseDecisionYaml(text);
    if (!parsed.ok) {
      for (const issue of parsed.errors) {
        io.err(issueDiagnostic(ref, issue));
        errorCount += 1;
      }
      continue; // an invalid decision cannot be ref-checked
    }

    const decision = parsed.data;
    const catalogRef = repo.resolveCatalogRef(ref, decision);
    let catalog = catalogCache.get(catalogRef);
    if (catalog === undefined) {
      try {
        catalog = await repo.readCatalog(catalogRef);
      } catch (error) {
        const why = error instanceof ArtifactValidationError ? 'is invalid' : 'cannot be read';
        io.err(`${ref}:1:1: error: referenced catalog "${catalogRef}" ${why}\n`);
        errorCount += 1;
        continue;
      }
    }

    // Authored SKU-line references — FATAL.
    const refErrors = validateRefs(decision, catalog);
    if (refErrors.length > 0) {
      const locate = makeLocator(text);
      for (const refError of refErrors) {
        const oi = decision.spec.options.findIndex((o) => o.id === refError.optionId);
        const option = oi >= 0 ? decision.spec.options[oi] : undefined;
        const li = option ? option.lines.findIndex((l) => l.id === refError.lineId) : -1;
        const path =
          oi >= 0 && li >= 0
            ? ['spec', 'options', oi, 'lines', li, refError.field]
            : ['spec', 'options'];
        const pos = locate(path);
        io.err(`${ref}:${pos.line}:${pos.col}: error: ${refError.message}\n`);
        errorCount += 1;
      }
    }

    // Lever references — NON-fatal warnings (the engine falls back to PAYG/24×7).
    const warnings = collectLeverRefWarnings(decision, catalog);
    if (warnings.length > 0) {
      const locate = makeLocator(text);
      for (const warning of warnings) {
        const pos = locate(warning.path);
        io.err(`${ref}:${pos.line}:${pos.col}: warning: ${warning.message}\n`);
        warningCount += 1;
      }
    }
  }

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
    io.err(`render-adr: no *.decision.yaml found under ${dir}\n`);
    return 1;
  }

  let ref: string;
  if (values.decision !== undefined) {
    const wanted = values.decision;
    const found = decisions.find((d) => d.ref === wanted || d.id === wanted);
    if (found === undefined) {
      io.err(`render-adr: no decision matching "${wanted}"\n`);
      return 1;
    }
    ref = found.ref;
  } else if (decisions.length === 1) {
    ref = decisions[0]!.ref;
  } else {
    io.err('render-adr: multiple decisions found; pass --decision <ref|id>:\n');
    for (const d of decisions) io.err(`  ${d.ref} (${d.id})\n`);
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

  const markdown = renderAdrMarkdown(buildAdrModel(decision, catalog));
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
