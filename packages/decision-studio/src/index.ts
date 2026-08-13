// @workspec/decision-studio — standalone CLI + (from S4) localhost host shell.
//
// S3 (#4) ships the filesystem repository and the CLI over the S3 repository
// port. S4 (#5) adds the Express host shell and the `serve` default subcommand
// mounting DecisionWorkspace.

import { UI_TARGET_SCHEMA } from '@workspec/decision-ui';

/** The artifact schema version this studio build serves. */
export const STUDIO_TARGET_SCHEMA = UI_TARGET_SCHEMA;

// ── Filesystem repository (implements the S3 DecisionRepositoryPort) ──────────
export { FsRepository, ArtifactValidationError } from './fs-repository.js';

// ── Comment-preserving YAML serialization ─────────────────────────────────────
export { serializeArtifact } from './serialize.js';

// ── Host shell: the Express app + the serve command (S4) ──────────────────────
export { createServer } from './server.js';
export type { CreateServerOptions } from './server.js';
export { runServe } from './serve.js';

// ── Lever reference warnings (non-fatal companion to engine validateRefs) ─────

// ── Shared validate diagnostics core (CLI `validate` + the `validate` MCP tool) ─
export { collectDiagnostics } from './collect-diagnostics.js';
export type { ValidateDiagnostic } from './collect-diagnostics.js';

// ── MCP provider (mount via @workspec/mcp-core's assembleMcpServer) ────────────
export { createDecisionMcpProvider } from './mcp-provider.js';

// ── CLI entry (also the executable's `run`) ───────────────────────────────────
export { run } from './cli.js';
export type { CliIO } from './cli.js';

// ── Re-export the port + in-memory double for host/embedder convenience ───────
export { createMemoryRepository } from '@workspec/decision-schema';
export type { DecisionRepositoryPort, DecisionRef, Ref } from '@workspec/decision-schema';
