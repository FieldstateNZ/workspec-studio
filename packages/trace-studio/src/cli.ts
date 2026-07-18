// The `workspec-trace` CLI core.
//
// T0 bootstrap skeleton (see docs/traceability/spec.md §7/§8): no verbs are
// implemented yet — `emit`/`ingest`/`verify` land in T4 ("shippable value
// with zero frontend"). `run` just prints usage and returns exit code 0.
//
// `run(argv, io)` is the testable entry point: it returns a process exit
// code and writes through an injectable IO (defaulting to the real streams),
// so tests can drive it and capture output without spawning a process —
// mirrors @workspec/cost-studio's shape, so real verbs slot in later without
// reshaping the entry point. `bin.ts` is the only thing that touches
// `process` directly.

/** Injectable IO. */
export interface CliIO {
  out(text: string): void;
  err(text: string): void;
}

const defaultIO: CliIO = {
  out: (text) => process.stdout.write(text),
  err: (text) => process.stderr.write(text),
};

const USAGE = `workspec-trace — WorkSpec Traceability Workbench CLI

Usage: workspec-trace <command> [options]

No commands are implemented yet — this is a bootstrap skeleton (T0).
See docs/traceability/spec.md §8 for the build sequence.
`;

/**
 * Runs the CLI. Currently a no-op that always prints usage and succeeds —
 * `argv` is accepted (and ignored) so the signature is stable once real
 * verbs are added.
 */
export async function run(_argv: string[], io: CliIO = defaultIO): Promise<number> {
  io.out(USAGE);
  return 0;
}
