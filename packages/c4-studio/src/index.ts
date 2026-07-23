// @workspec/c4-studio — standalone CLI (validate, render, serve) + localhost
// host shell for a working tree's .workspec/ files.

// ── Host shell: the Express app + the serve command ────────────────────────
export { createServer } from './server.js';
export type { CreateServerOptions } from './server.js';
export { runServe, SERVE_HELP } from './serve.js';

// ── Standalone diagram rendering (shared by the `render` command) ──────────
export { renderDiagramToSvg } from './render-diagram.js';
export type { RenderDiagramOptions, RenderDiagramResult } from './render-diagram.js';

// ── MCP provider (mount via @workspec/mcp-core's assembleMcpServer) ────────
export { createC4McpProvider } from './mcp-provider.js';

// ── CLI entry (also the executable's `run`) ─────────────────────────────────
export { run } from './cli.js';
export type { CliIO } from './cli.js';

// ── Re-exports for embedder convenience: the file-source port + the loader ──
export { loadC4Model, createMemorySource } from '@workspec/c4-model';
export type { C4FileSource, C4Model, C4Diagnostic } from '@workspec/c4-model';
export { createFsSource } from '@workspec/c4-model/fs';
