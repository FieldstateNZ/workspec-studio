// The C4 Studio CLI — three subcommands over a `.workspec/` working tree:
// `validate` (CI-friendly diagnostics), `render` (one diagram to a standalone
// SVG), and `serve` (the localhost host shell, the DEFAULT command).
//
// `run(argv, io)` is the testable entry point: it returns a process exit code
// and writes through an injectable IO (defaulting to the real streams), so
// tests can drive it and capture output without spawning a process. `bin.ts`
// is the only thing that touches `process`.

import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { C4Diagnostic } from '@workspec/c4-model';
import { loadC4Model } from '@workspec/c4-model';
import { createFsSource } from '@workspec/c4-model/fs';
import type { ThemeName } from '@workspec/c4-ui';
import { renderDiagramToSvg } from './render-diagram.js';
import { runServe } from './serve.js';

/** Injectable IO. `out` is reserved for artifacts (SVG, JSON diagnostics); `err` for human-readable diagnostics and notes. */
export interface CliIO {
  out(text: string): void;
  err(text: string): void;
}

const defaultIO: CliIO = {
  out: (text) => process.stdout.write(text),
  err: (text) => process.stderr.write(text),
};

const HELP = `workspec-c4 — browse, validate, and render C4 architecture trees from your repo

Usage:
  workspec-c4 [command] [options]

Commands:
  serve      Run the localhost host shell over a directory (DEFAULT command).
  validate   Validate every element/diagram/layout under a directory (CI-friendly).
  render     Render one diagram to a standalone SVG.

With no command, "serve" runs. Run "workspec-c4 <command> --help" for command options.
`;

const VALIDATE_HELP = `workspec-c4 validate — validate a .workspec/ tree

Usage:
  workspec-c4 validate [--dir <path>] [--json] [--strict]

Options:
  --dir <path>   Directory containing .workspec/ to scan (default: current directory).
  --json         Also print the diagnostics array as JSON to stdout.
  --strict       Exit non-zero if any WARNING-severity diagnostic is present
                 (by default only error-severity diagnostics fail the run).

Loads the tree via @workspec/c4-model, printing every diagnostic as
"file:line: [severity] code message (slug)" (line omitted for file-only
codes) to stderr. An empty or missing .workspec/ directory is a clean,
zero-diagnostic run, not an error.
`;

const RENDER_HELP = `workspec-c4 render — render one diagram to a standalone SVG

Usage:
  workspec-c4 render <diagram-slug> [--dir <path>] [--out <file>] [--theme light|dark]

Options:
  --dir <path>       Directory containing .workspec/ to scan (default: current directory).
  --out <file>       Write the SVG here (default: "<diagram-slug>.svg"). Use "-" for stdout.
  --theme <name>     "light" (default) or "dark" — which token set to resolve into the SVG.

Lays the named diagram out via @workspec/c4-layout (honouring any .layout/
pins) and renders it via @workspec/c4-ui's renderSvg. Deterministic: the same
tree always produces byte-identical output. A "c4-container" diagram (which
resolves to a logical/deployment lens pair, not one view) always renders its
logical lens — use "serve" for the interactive deployment lens.
`;

function formatDiagnostic(diagnostic: C4Diagnostic): string {
  const location =
    diagnostic.line !== undefined ? `${diagnostic.file}:${diagnostic.line}` : diagnostic.file;
  const slugSuffix = diagnostic.slug !== undefined ? ` (${diagnostic.slug})` : '';
  return `${location}: [${diagnostic.severity}] ${diagnostic.code} ${diagnostic.message}${slugSuffix}\n`;
}

async function runValidate(argv: string[], io: CliIO): Promise<number> {
  let values: { dir?: string; json?: boolean; strict?: boolean; help?: boolean };
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        dir: { type: 'string' },
        json: { type: 'boolean' },
        strict: { type: 'boolean' },
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
  const model = await loadC4Model(createFsSource(dir));

  const elementCount = Object.values(model.elements).reduce((sum, byKind) => sum + byKind.size, 0);
  const diagramCount = model.diagrams.length;
  const specCount = model.spec.path !== null ? 1 : 0;
  const totalArtifacts = elementCount + diagramCount + specCount;

  for (const diagnostic of model.diagnostics) io.err(formatDiagnostic(diagnostic));
  if (values.json === true) io.out(`${JSON.stringify(model.diagnostics)}\n`);

  const errorCount = model.diagnostics.filter((d) => d.severity === 'error').length;
  const warningCount = model.diagnostics.length - errorCount;

  if (totalArtifacts === 0 && model.diagnostics.length === 0) {
    io.err(`validate: no .workspec/ tree found under ${dir} — nothing to validate\n`);
    return 0;
  }
  if (errorCount === 0) {
    const suffix = warningCount > 0 ? `, ${warningCount} warning(s)` : '';
    io.err(`validate: ${totalArtifacts} artifact(s) OK${suffix}\n`);
    return values.strict === true && warningCount > 0 ? 1 : 0;
  }
  io.err(
    `validate: ${errorCount} error(s), ${warningCount} warning(s) across ${totalArtifacts} artifact(s)\n`,
  );
  return 1;
}

async function runRender(argv: string[], io: CliIO): Promise<number> {
  let values: { dir?: string; out?: string; theme?: string; help?: boolean };
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({
      args: argv,
      options: {
        dir: { type: 'string' },
        out: { type: 'string' },
        theme: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
      allowPositionals: true,
    }));
  } catch (error) {
    io.err(`render: ${(error as Error).message}\n`);
    return 2;
  }
  if (values.help === true) {
    io.out(RENDER_HELP);
    return 0;
  }

  const slug = positionals[0];
  if (slug === undefined) {
    io.err('render: missing required <diagram-slug> argument\n');
    return 2;
  }

  const rawTheme = values.theme;
  if (rawTheme !== undefined && rawTheme !== 'light' && rawTheme !== 'dark') {
    io.err(`render: invalid --theme "${rawTheme}" (expected "light" or "dark")\n`);
    return 2;
  }
  const theme: ThemeName | undefined = rawTheme;

  const dir = values.dir ?? process.cwd();
  const model = await loadC4Model(createFsSource(dir));
  const result = await renderDiagramToSvg(model, slug, theme !== undefined ? { theme } : {});

  if (!result.ok) {
    io.err(`render: no diagram "${slug}" found under ${dir}\n`);
    if (result.availableSlugs.length > 0) {
      io.err('  available diagrams:\n');
      for (const available of result.availableSlugs) io.err(`    ${available}\n`);
    } else {
      io.err('  (the tree has no diagrams)\n');
    }
    return 1;
  }

  if (values.out === '-') {
    io.out(result.svg);
    return 0;
  }
  const outPath = resolve(process.cwd(), values.out ?? `${slug}.svg`);
  await writeFile(outPath, result.svg, 'utf8');
  io.err(`render: wrote ${outPath}\n`);
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
    case 'render':
      return runRender(rest, io);
    case undefined:
      // No subcommand → start the host (the default command).
      return runServe(rest, io);
    case 'help':
    case '--help':
    case '-h':
      io.out(HELP);
      return 0;
    default:
      io.err(`workspec-c4: unknown command "${command}"\n`);
      io.out(HELP);
      return 2;
  }
}
