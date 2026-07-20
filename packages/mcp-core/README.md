# @workspec/mcp-core

Shared MCP plumbing for WorkSpec Studio. This package has **zero domain knowledge** — it doesn't
know what a decision, a catalog, or a cost is — and **zero `zod` dependency**. Its only job is
wiring: turn a list of namespaced tool providers into a working MCP server, and expose that server
over HTTP (mounted on an existing Express app) or stdio.

## Why zod-agnostic

The MCP TypeScript SDK's high-level `McpServer.registerTool` API takes zod schemas and derives JSON
Schema from them internally, which couples every tool's schema to whatever zod major version the
SDK happens to bundle. `@workspec/mcp-core` avoids that by using the SDK's low-level `Server` class
directly: tools advertise a plain JSON Schema object (`Record<string, unknown>`) and validate their
own arguments however they like — with zod, with a hand-written check, or with a JSON Schema
validator. Domain packages (`@workspec/decision-studio`, and future `@workspec/cost-studio` /
`@workspec/c4-studio` providers) own the zod dependency and the schema-to-JSON-Schema generation;
this package never sees a zod schema.

## The contract

```ts
export interface McpToolDef {
  name: string; // module-local, must match /^[a-zA-Z0-9_]+$/
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>; // a JSON Schema object, advertised on the wire
  handler: (args: unknown) => Promise<CallToolResult>; // self-validates its own args
}

export interface McpToolProvider {
  namespace: string;
  tools: McpToolDef[];
}

export function assembleMcpServer(
  providers: McpToolProvider[],
  info?: { name: string; version: string },
): Server;

export function mountMcpHttp(
  app: Express,
  server: Server,
  opts?: { path?: string; allowedHosts?: string[] },
): void;

export async function runMcpStdio(server: Server): Promise<void>;
```

## Usage

```ts
import { assembleMcpServer, mountMcpHttp, runMcpStdio } from '@workspec/mcp-core';
import { createDecisionMcpProvider } from '@workspec/decision-studio';

const server = assembleMcpServer([createDecisionMcpProvider(repo)]);

// Mounted on an existing Express app, stateless, localhost-only:
mountMcpHttp(app, server);

// Or over stdio, for agents that spawn the CLI directly:
await runMcpStdio(server);
```

Every tool is registered under the wire name `${namespace}_${name}` (e.g. `decisions_read_catalog`).
Assembly throws immediately on an invalid name or a duplicate wire name — a naming collision is a
programming error in how providers were composed, not something callers should have to handle at
call time. A handler that throws unexpectedly is converted to an `isError` `CallToolResult`; it
never crashes the server, and only `Error#message` is surfaced (never a stack trace).

## HTTP transport notes

`mountMcpHttp` runs the MCP `StreamableHTTPServerTransport` in **stateless** mode
(`sessionIdGenerator: undefined`) with DNS-rebinding protection enabled and `allowedHosts` defaulted
to `127.0.0.1` / `localhost`. The SDK's low-level `Server` only supports one connected transport at a
time, so requests to the mounted path are serialized: each request's transport is connected,
handled, and closed before the next one connects. For the single-user, localhost-bound hosts this
targets, that is not a meaningful limitation.
