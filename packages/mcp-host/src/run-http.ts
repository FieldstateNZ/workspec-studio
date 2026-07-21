// The `--http` runtime: binds `buildHttpApp`'s Express app to a real socket
// and resolves only when the server closes (Ctrl-C / SIGTERM), mirroring
// `packages/decision-studio/src/serve.ts`'s `runServe`. Kept separate from
// `http-app.ts` (the pure, listen-free app builder) so tests can exercise
// the mount itself with `supertest` without ever binding a socket, while
// this file stays the one place that actually listens.

import type { AddressInfo } from 'node:net';
import { buildHttpApp } from './http-app.js';
import type { CliIO } from './cli.js';

/** Options for {@link runHttp}. */
export interface RunHttpOptions {
  /** Directory shared by all four MCP providers. */
  dir: string;
  /** Port to listen on. `0` binds an OS-assigned ephemeral port. */
  port: number;
  /** Address to bind. */
  host: string;
}

/**
 * Binds `options.host:options.port` and serves the aggregate MCP server at
 * `/mcp`. Resolves to the process exit code once the server closes (on
 * `SIGINT`/`SIGTERM`, or immediately with `1` on a bind error such as
 * `EADDRINUSE`) — the process stays alive serving requests until then.
 */
export async function runHttp(options: RunHttpOptions, io: CliIO): Promise<number> {
  const { dir, port, host } = options;
  const app = buildHttpApp(dir);

  return new Promise<number>((resolvePromise) => {
    const server = app.listen(port, host, () => {
      const address = server.address() as AddressInfo | null;
      const boundPort = address?.port ?? port;
      io.err(`WorkSpec MCP Host · serving ${dir}\n`);
      io.err(`  → http://${host}:${boundPort}/mcp (decisions, cost, c4, trace)\n`);
      io.err('  press Ctrl-C to stop\n');
    });

    server.on('error', (error: NodeJS.ErrnoException) => {
      io.err(`mcp --http: ${error.code === 'EADDRINUSE' ? `port ${port} is in use` : error.message}\n`);
      resolvePromise(1);
    });

    const shutdown = (): void => {
      server.close(() => resolvePromise(0));
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  });
}
