// The `serve` subcommand (also the default): boot the localhost host shell
// over a directory. Factored out of `cli.ts` so the Express app itself
// (`createServer`) stays independently testable. `runServe` binds a socket
// and resolves only when the server closes (Ctrl-C), which is what a
// long-running host wants; the `--help` path returns without binding.

import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { createFsSource } from '@workspec/c4-model/fs';
import { bindHostWarning } from './bind-host-warning.js';
import type { CliIO } from './cli.js';
import { createC4McpProvider } from './mcp-provider.js';
import { createMutationQueue } from './mutations/mutation-queue.js';
import { createServer } from './server.js';

export const SERVE_HELP = `workspec-c4 serve — run the localhost C4 Studio host

Usage:
  workspec-c4 [serve] [--dir <path>] [--port <n>] [--host <addr>] [--mcp]

Options:
  --dir <path>    Directory containing .workspec/ to serve (default: current directory).
  --port <n>      Port to listen on (default: 4174).
  --host <addr>   Address to bind (default: 127.0.0.1 — localhost only).
  --mcp           Also mount an MCP server (stateless, localhost-only) at /mcp,
                  exposing get_model/validate/render/import_aspire/write_layout as tools.

Serves the built client and a thin JSON API over the working tree: mounts
C4Explorer with { editLayout: true } — browse diagrams, drill down, and
drag-to-pin writes .layout/ files back into the tree. Authoring mutations
(create/rename/update/delete elements and relations) persist through the
zod-gated /api/elements and /api/relations routes as schema-valid YAML.
No database: the .workspec/ files under --dir are the single source of
truth.
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
  const port = values.port !== undefined ? Number(values.port) : 4174;
  const host = values.host ?? '127.0.0.1';
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    io.err(`serve: invalid --port "${values.port}"\n`);
    return 2;
  }

  // ONE write queue for the whole served tree, created HERE (the composition
  // root) rather than inside `createServer`, because with `--mcp` there are
  // two in-process writers of the same `.layout/` files: the HTTP API and the
  // `c4_write_layout` MCP tool. Same process, same tree — so they share the
  // real queue. (A SEPARATE `workspec-c4 mcp` process is out of scope: this
  // is an in-process mutex, not a file lock.)
  const writeQueue = createMutationQueue();
  const mcpProvider =
    values.mcp === true ? createC4McpProvider(createFsSource(resolve(dir)), writeQueue) : undefined;
  const app = createServer({
    dir,
    bindHost: host,
    writeQueue,
    ...(mcpProvider !== undefined ? { mcpProvider } : {}),
  });

  return new Promise<number>((resolvePromise) => {
    const server = app.listen(port, host, () => {
      const address = server.address() as AddressInfo | null;
      const boundPort = address?.port ?? port;
      io.err(`C4 Studio · serving ${dir}\n`);
      io.err(`  → http://${host}:${boundPort}\n`);
      if (mcpProvider !== undefined) {
        io.err(`  → http://${host}:${boundPort}/mcp (MCP, stateless)\n`);
      }
      // Fail LOUDLY rather than silently: the API's DNS-rebinding guard
      // allowlists loopback plus this exact bind address, so a browser that
      // reaches the studio under any OTHER name gets 403 on every request.
      // Without this, that reads as "the studio is broken".
      const warning = bindHostWarning(host, boundPort);
      if (warning !== null) io.err(warning);
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
