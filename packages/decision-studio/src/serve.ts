// The `serve` subcommand (also the default): boot the localhost host shell over a
// directory of artifacts. Factored out of `cli.ts` so the Express app itself
// (`createServer`) stays independently testable. `runServe` binds a socket and
// resolves only when the server closes (Ctrl-C), which is what a long-running
// host wants; the `--help` path returns without binding.

import { resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import { parseArgs } from 'node:util';
import type { CliIO } from './cli.js';
import { FsRepository } from './fs-repository.js';
import { createDecisionMcpProvider } from './mcp-provider.js';
import { createServer } from './server.js';

export const SERVE_HELP = `workspec-decisions serve — run the localhost Decision Studio host

Usage:
  workspec-decisions [serve] [--dir <path>] [--port <n>] [--host <addr>] [--mcp]

Options:
  --dir <path>    Directory of *.decision.yaml / *.catalog.yaml to serve
                  (default: current directory).
  --port <n>      Port to listen on (default: 4173).
  --host <addr>   Address to bind (default: 127.0.0.1 — localhost only).
  --mcp           Also mount an MCP server (stateless, localhost-only) at /mcp,
                  exposing the same reads/writes/validate/render-adr as tools.

Serves the built client and a thin JSON API over the working tree. No database:
the *.yaml files under --dir are the single source of truth.
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
    values.mcp === true ? createDecisionMcpProvider(new FsRepository(resolve(dir))) : undefined;
  const app = createServer(mcpProvider !== undefined ? { dir, mcpProvider } : { dir });

  return new Promise<number>((resolvePromise) => {
    const server = app.listen(port, host, () => {
      const address = server.address() as AddressInfo | null;
      const boundPort = address?.port ?? port;
      io.err(`Decision Studio · serving ${dir}\n`);
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
