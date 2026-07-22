// Builds the minimal Express app for `--http` mode: no REST API surface (the
// individual `*-studio` packages already have that, each over its own single
// module) — just enough to mount the aggregate MCP server at `/mcp` via
// `@workspec/mcp-core`'s `mountMcpHttp`. Exported separately from
// `run-http.ts` (which binds a real socket) so it stays testable with
// `supertest` against the app object directly, no listening socket required
// — mirrors `@workspec/decision-studio`'s split between `createServer`
// (testable) and `runServe` (binds + listens).

import express from 'express';
import type { Express } from 'express';
import { assembleMcpServer, mountMcpHttp } from '@workspec/mcp-core';
import { buildAllProviders } from './assemble.js';
import { MCP_HOST_SERVER_INFO } from './server-info.js';

/**
 * Builds the Express app serving the aggregate MCP server over `dir` at
 * `/mcp`. `express.json()` is mounted before `mountMcpHttp` — the SDK's
 * `StreamableHTTPServerTransport.handleRequest` expects the body already
 * parsed (see `packages/decision-studio/src/server.ts`'s equivalent
 * ordering).
 */
export function buildHttpApp(dir: string): Express {
  const app = express();
  app.use(express.json({ limit: '4mb' }));

  // Liveness probe for orchestrators (e.g. the Aspire `AddWorkspecMcp` resource
  // health check). Deliberately unauthenticated and side-effect-free — it only
  // reports that the aggregate host is up and which directory it serves; it does
  // not touch the MCP transport. Mirrors every `*-studio` host's `/api/health`.
  app.get('/health', (_req, res) => {
    res.json({ ok: true, dir });
  });

  const server = assembleMcpServer(buildAllProviders(dir), MCP_HOST_SERVER_INFO);
  mountMcpHttp(app, server);

  return app;
}
