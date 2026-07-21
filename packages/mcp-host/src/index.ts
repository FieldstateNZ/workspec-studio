// @workspec/mcp-host — the aggregate WorkSpec Studio MCP server. This is the
// Step 5 capstone: `@workspec/mcp-core`'s shared plumbing plus all four
// `*-studio` MCP providers (decisions, cost, c4, trace), assembled once over
// a single shared directory and exposed as one server (stdio or --http) via
// the `workspec-mcp` executable.

// ── Provider assembly (build all four over one directory) ──────────────────
export { buildAllProviders } from './assemble.js';

// ── The Express app for `--http` mode (testable without a real socket) ─────
export { buildHttpApp } from './http-app.js';

// ── Runtime entry points (bind a real socket / speak stdio) ─────────────────
export { runHttp } from './run-http.js';
export type { RunHttpOptions } from './run-http.js';
export { runStdio } from './run-stdio.js';

// ── Server identity shared by both transports ───────────────────────────────
export { MCP_HOST_SERVER_INFO } from './server-info.js';

// ── CLI entry (also the executable's `run`) ─────────────────────────────────
export { run, HELP } from './cli.js';
export type { CliIO } from './cli.js';
