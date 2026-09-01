// The `serve` subcommand: boot the localhost host shell over a directory of
// cost artifacts. Factored out of `cli.ts` so the Express app itself
// (`createServer`) stays independently testable. `runServe` binds a socket
// and resolves only when the server closes (Ctrl-C), which is what a
// long-running host wants; the `--help` path returns without binding.
//
// Divergence from `@workspec/decision-studio`: there, `serve` is also the
// bare (no-argument) default command. Here it is NOT — `workspec-cost` with
// no command prints help (an already-established, already-tested C4
// behavior; see `cli.ts`'s `run()` and `cli.test.ts`'s "help + dispatch"
// suite), so this CLI keeps that bar rather than silently changing what a
// bare `workspec-cost` invocation does.

import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { CliIO } from './cli.js';
import { FsRepository } from './fs-repository.js';
import { createCostMcpProvider } from './mcp-provider.js';
import { createServer } from './server.js';

export const SERVE_HELP = `workspec-cost serve — run the localhost Cost Studio host

Usage:
  workspec-cost serve [--dir <path>] [--port <n>] [--host <addr>] [--mcp]

Options:
  --dir <path>    Working tree containing .workspec/inventories, spends,
                  attributions, and tagplans directories to serve
                  (default: current directory).
  --port <n>      Port to listen on (default: 4173).
  --host <addr>   Address to bind (default: 127.0.0.1 — localhost only).
  --mcp           Also mount an MCP server (stateless, localhost-only) at /mcp,
                  exposing the same reads/writes/validate/report/plan as tools.

Serves the built client and a thin JSON API over the working tree. No
database: the artifacts under --dir are the single source of truth.
`;

/** Run the host. Resolves to the process exit code (on server close / bind error). */
export async function runServe(argv: string[], io: CliIO): Promise<number> {
  let values: { dir?: string; port?: string; host?: string; mcp?: boolean; help?: boolean };
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        dir: { type: 'string' },
        port: { type: 'string' },
        host: { type: 'string' },
        mcp: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
      },
      allowPositionals: false,
    }));
  } catch (error) {
    io.err(`serve: ${(error as Error).message}\n`);
    return 2;
  }

  if (values.help === true) {
    io.out(SERVE_HELP);
    return 0;
  }

  const dir = values.dir ?? process.cwd();
  const port = values.port !== undefined ? Number(values.port) : 4173;
  const host = values.host ?? '127.0.0.1';
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    io.err(`serve: invalid --port "${values.port}"\n`);
    return 2;
  }

  const mcpProvider =
    values.mcp === true ? createCostMcpProvider(new FsRepository(resolve(dir))) : undefined;
  const app = createServer(mcpProvider !== undefined ? { dir, mcpProvider } : { dir });

  return new Promise<number>((resolvePromise) => {
    const server = app.listen(port, host, () => {
      const address = server.address() as AddressInfo | null;
      const boundPort = address?.port ?? port;
      io.err(`Cost Studio · serving ${dir}\n`);
      io.err(`  → http://${host}:${boundPort}\n`);
      if (mcpProvider !== undefined) {
        io.err(`  → http://${host}:${boundPort}/mcp (MCP, stateless)\n`);
      }
      io.err('  press Ctrl-C to stop\n');
    });

    server.on('error', (error: NodeJS.ErrnoException) => {
      io.err(`serve: ${error.code === 'EADDRINUSE' ? `port ${port} is in use` : error.message}\n`);
      resolvePromise(1);
    });

    const shutdown = (): void => {
      server.close(() => resolvePromise(0));
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  });
}
