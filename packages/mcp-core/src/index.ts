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
