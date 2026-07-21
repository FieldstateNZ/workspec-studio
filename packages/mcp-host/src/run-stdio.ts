// stdio entry point: build all four providers over `dir`, assemble one
// server, and speak MCP over stdin/stdout. Mirrors each individual
// `*-studio` package's own `run-mcp.ts` shape (see e.g.
// `packages/trace-studio/src/run-mcp.ts`), adapted to build four providers
// instead of one.
//
// stdio IS the MCP protocol channel here — anything written to stdout after
// the server connects corrupts the JSON-RPC stream a client is reading. All
// diagnostics go through `io.err`.

import { assembleMcpServer, runMcpStdio } from '@workspec/mcp-core';
import { buildAllProviders } from './assemble.js';
import { MCP_HOST_SERVER_INFO } from './server-info.js';
import type { CliIO } from './cli.js';

/**
 * Runs the aggregate MCP server over stdio for `dir`. Resolves once
 * connected (the process then stays alive reading stdin until the client
 * disconnects or the process is killed) — the same contract every
 * `*-studio` package's own `runMcp` has.
 */
export async function runStdio(dir: string, io: CliIO): Promise<number> {
  const server = assembleMcpServer(buildAllProviders(dir), MCP_HOST_SERVER_INFO);

  await runMcpStdio(server);
  io.err(`WorkSpec MCP Host · serving ${dir} over stdio (decisions, cost, c4, trace)\n`);
  return 0;
}
