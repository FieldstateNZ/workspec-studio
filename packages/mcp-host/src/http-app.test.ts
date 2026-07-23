// HTTP-level tests for `buildHttpApp`, driven with supertest against the
// plain Express app (no real socket bound) — mirrors
// `@workspec/mcp-core`'s own `mount-mcp-http.test.ts`, which uses the same
// raw-JSON-RPC-over-supertest pattern for the same reason: the stateless
// mount has no session for the SDK's own HTTP client transport to track
// across the handshake, so the wire protocol is driven directly.

import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildFixtureTree } from './build-fixture-tree.js';
import type { FixtureTree } from './build-fixture-tree.js';
import { buildHttpApp } from './http-app.js';

const MCP_ACCEPT = 'application/json, text/event-stream';

function initializeBody(): Record<string, unknown> {
  return {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'supertest-client', version: '0.0.0' },
    },
  };
}

/** Pulls the JSON-RPC payload out of the transport's default SSE response body. */
function parseSseJsonRpcBody(sseText: string): { jsonrpc: string; result?: Record<string, unknown> } {
  const dataLine = sseText.split('\n').find((line) => line.startsWith('data: '));
  if (dataLine === undefined) {
    throw new Error(`no SSE "data:" line found in response body: ${sseText}`);
  }
  return JSON.parse(dataLine.slice('data: '.length)) as { jsonrpc: string; result?: Record<string, unknown> };
}

describe('buildHttpApp', () => {
  let fixture: FixtureTree;

  beforeEach(async () => {
    fixture = await buildFixtureTree();
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  it('mounts the aggregate MCP server at /mcp and initializes as "workspec-mcp"', async () => {
    const app = buildHttpApp(fixture.dir);

    const res = await request(app)
      .post('/mcp')
      .set('Accept', MCP_ACCEPT)
      .set('Content-Type', 'application/json')
      .send(initializeBody());

    expect(res.status).toBe(200);
    const body = parseSseJsonRpcBody(res.text);
    expect(body.jsonrpc).toBe('2.0');
    expect(body.result?.serverInfo).toMatchObject({ name: 'workspec-mcp' });
  });

  it('rejects a non-localhost Host header (mountMcpHttp\'s own DNS-rebinding guard)', async () => {
    const app = buildHttpApp(fixture.dir);

    const res = await request(app)
      .post('/mcp')
      .set('Accept', MCP_ACCEPT)
      .set('Content-Type', 'application/json')
      .set('Host', 'evil.example.com')
      .send(initializeBody());

    expect(res.status).toBe(403);
  });

  it('serves an unauthenticated /health liveness probe reporting the served dir', async () => {
    const app = buildHttpApp(fixture.dir);

    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, dir: fixture.dir });
  });
});
