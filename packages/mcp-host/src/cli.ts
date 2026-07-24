// The `workspec-mcp` CLI — the aggregate MCP host over one shared directory.
// Unlike each `*-studio` package's own CLI (which has several subcommands),
// this one has exactly one job: serve all five MCP providers, either over
// stdio (the default) or over HTTP (`--http`). `run(argv, io)` is the
// testable entry point: it returns a process exit code and writes through an
// injectable IO, so tests can drive it without spawning a process or
// (for the default stdio path) ever touching stdin. `bin.ts` is the only
// file that touches `process` directly.

import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { runHttp } from './run-http.js';
import { runStdio } from './run-stdio.js';

/** Injectable IO. `out` is reserved for `--help` text; `err` for all diagnostics. */
export interface CliIO {
  out(text: string): void;
  err(text: string): void;
}

const defaultIO: CliIO = {
  out: (text) => process.stdout.write(text),
  err: (text) => process.stderr.write(text),
};

/** Default port for `--http` mode — distinct from every `*-studio` package's own `serve` port (4173/4174). */
const DEFAULT_HTTP_PORT = 3000;

/** Default bind address — localhost only, matching every other WorkSpec Studio host. */
const DEFAULT_HOST = '127.0.0.1';

export const HELP = `workspec-mcp — the aggregate WorkSpec Studio MCP server

Usage:
  workspec-mcp [--dir <path>] [--http] [--port <n>] [--host <addr>]

Options:
  --dir <path>   Directory shared by every MCP provider (default: current
                 directory). Each of decisions/cost/c4/trace/topology reads
                 and writes its own artifact kinds under this one tree.
  --http         Serve over HTTP (stateless, mounted at /mcp) instead of
                 stdio. Without this flag, speaks MCP over stdin/stdout.
  --port <n>     Port to listen on with --http (default: ${DEFAULT_HTTP_PORT}).
  --host <addr>  Address to bind with --http (default: ${DEFAULT_HOST} — localhost only).

Assembles the decisions, cost, c4, trace, and topology MCP providers (each
namespaced as decisions_*/cost_*/c4_*/trace_*/topology_*) into a single
server. With stdio (the default), stdout is the JSON-RPC protocol channel
and carries nothing else — every diagnostic goes to stderr.
`;

/**
 * The CLI entry point. Parses `argv` (already stripped of `node` + script)
 * and dispatches to stdio (default) or `--http`. Writes through `io`
 * (defaults to the real stdout/stderr).
 */
export async function run(argv: string[], io: CliIO = defaultIO): Promise<number> {
  let values: { dir?: string; http?: boolean; port?: string; host?: string; help?: boolean };
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        dir: { type: 'string' },
        http: { type: 'boolean' },
        port: { type: 'string' },
        host: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
      allowPositionals: false,
    }));
  } catch (error) {
    io.err(`workspec-mcp: ${(error as Error).message}\n`);
    return 2;
  }

  if (values.help === true) {
    io.out(HELP);
    return 0;
  }

  const dir = resolve(values.dir ?? process.cwd());

  if (values.http !== true) {
    return runStdio(dir, io);
  }

  const port = values.port !== undefined ? Number(values.port) : DEFAULT_HTTP_PORT;
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    io.err(`workspec-mcp: invalid --port "${values.port}"\n`);
    return 2;
  }
  const host = values.host ?? DEFAULT_HOST;

  return runHttp({ dir, port, host }, io);
}
