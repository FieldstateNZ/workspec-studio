// @workspec/mcp-core — shared MCP plumbing for WorkSpec Studio. Zero domain
// knowledge: this package only knows how to assemble namespaced tool
// providers into an MCP `Server` and expose it over HTTP or stdio. It has no
// dependency on zod (or any particular schema library) — tools advertise raw
// JSON Schema and validate their own arguments.

export type { McpToolDef, McpToolProvider } from './mcp-tool.types.js';
export { assembleMcpServer } from './assemble-mcp-server.js';
export { mountMcpHttp } from './mount-mcp-http.js';
export type { MountMcpHttpOptions } from './mount-mcp-http.js';
export { runMcpStdio } from './run-mcp-stdio.js';
export { toErrorResult } from './to-error-result.js';

// Shared provider utilities — generic building blocks every `*-studio` MCP
// provider composes, so read/write/error-mapping plumbing can't drift
// between modules. Each module still owns its own error *classification*
// (its repository's error types) via `ErrorClassifier`/`mapErrorToResult`.
export { isSafeRelativeRef } from './ref-shape.js';
export { readStringArg } from './read-string-arg.js';
export { readObjectArg } from './read-object-arg.js';
export { readRefArg, InvalidRefError } from './read-ref-arg.js';
export { readSlugArg, InvalidSlugError } from './read-slug-arg.js';
export { validateThenWrite } from './validate-then-write.js';
export type { SafeParseOutcome } from './validate-then-write.js';
export { mapErrorToResult } from './map-error-to-result.js';
export type { ErrorClassifier, MapErrorToResultOptions } from './map-error-to-result.js';
