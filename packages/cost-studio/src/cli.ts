// The Cost Attribution CLI — a help-stub skeleton for C0. Real subcommands
// (validate, serve, ...) land in a later slice, mirroring
// packages/decision-studio/src/cli.ts's `run`/`CliIO` structure.
//
// `run(argv, io)` is the testable entry point: it returns a process exit code
// and writes through an injectable IO (defaulting to the real streams), so
// tests can drive it and capture output without spawning a process. `bin.ts`
// is the only thing that touches `process`.

/** Injectable IO. `out` is reserved for artifacts; `err` for diagnostics. */
export interface CliIO {
  out(text: string): void;
  err(text: string): void;
}

const defaultIO: CliIO = {
  out: (text) => process.stdout.write(text),
  err: (text) => process.stderr.write(text),
};

const HELP = `workspec-cost — cost attribution for WorkSpec Studio

Usage:
  workspec-cost [command]

This is a C0 bootstrap: no commands are implemented yet. Real subcommands
land starting a later slice (see issues C0–C7).
`;

/**
 * The CLI entry point. Parses `argv` (already stripped of `node` + script)
 * and resolves to the process exit code. Writes through `io` (defaults to the
 * real stdout/stderr).
 */
export async function run(argv: string[], io: CliIO = defaultIO): Promise<number> {
  const [command] = argv;
  switch (command) {
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      io.out(HELP);
      return 0;
    default:
      io.err(`workspec-cost: unknown command "${command}"\n`);
      return 1;
  }
}
