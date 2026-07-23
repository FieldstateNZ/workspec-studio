// The `mcp` subcommand: run the cost MCP server over stdio. Factored out of
// `cli.ts` for the same reason `serve.ts` is: keeps `run-mcp.ts`'s own
// imports (the MCP wiring) out of the command-dispatch module.
//
// stdio IS the MCP protocol channel here — anything this command writes to
// stdout corrupts the JSON-RPC stream a client is reading. Every diagnostic
// this command produces (the `--help` text, argument errors) goes through
// `io.err`/`io.out` exactly like every other subcommand, but unlike `serve`
// and `validate`, `runMcp` never calls `io.out` once the server is actually
// running — there is nothing left to print that wouldn't be protocol noise.

import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { assembleMcpServer, runMcpStdio } from '@workspec/mcp-core';
import type { CliIO } from './cli.js';
import { FsRepository } from './fs-repository.js';
import { createCostMcpProvider } from './mcp-provider.js';

export const MCP_HELP = `workspec-cost mcp — run the cost MCP server over stdio

Usage:
  workspec-cost mcp [--dir <path>]

Options:
  --dir <path>   Directory of cost artifacts to serve (default: current directory).

Speaks MCP over stdin/stdout (JSON-RPC) — meant to be spawned by an MCP
client/agent, not run interactively. All diagnostics go to stderr; stdout is
the protocol channel and carries nothing else. \`stocktake\`/\`apply\` use the
real Azure provider (\`createAzureProvider()\`) — the same credentials the CLI
itself needs.
`;

/** Run the `mcp` subcommand. Resolves once connected (the process then stays alive reading stdin). */
export async function runMcp(argv: string[], io: CliIO): Promise<number> {
  let values: { dir?: string; help?: boolean };
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        dir: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
      allowPositionals: false,
    }));
  } catch (error) {
    io.err(`mcp: ${(error as Error).message}\n`);
    return 2;
  }

  if (values.help === true) {
    io.out(MCP_HELP);
    return 0;
  }

  const dir = resolve(values.dir ?? process.cwd());
  const repo = new FsRepository(dir);
  const server = assembleMcpServer([createCostMcpProvider(repo)]);

  await runMcpStdio(server);
  io.err(`Cost Studio MCP · serving ${dir} over stdio\n`);
  return 0;
}
