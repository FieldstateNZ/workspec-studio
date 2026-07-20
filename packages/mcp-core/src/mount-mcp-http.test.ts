// HTTP-level tests for `mountMcpHttp`, driven with supertest against a plain
// Express app (no real socket bound). Exercises the raw JSON-RPC wire
// protocol directly rather than through the SDK's HTTP client transport,
// since the stateless mode here has no session for a client transport to
// track across the handshake.

import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { assembleMcpServer } from './assemble-mcp-server.js';
import { mountMcpHttp } from './mount-mcp-http.js';
import type { McpToolProvider } from './mcp-tool.types.js';

const MCP_ACCEPT = 'application/json, text/event-stream';

function pingProvider(): McpToolProvider {
  return {
    namespace: 'alpha',
    tools: [
      {
        name: 'ping',
        description: 'Replies pong.',
        inputSchema: { type: 'object', properties: {} },
        handler: async () => ({ content: [{ type: 'text', text: 'pong' }] }),
      },
    ],
  };
}

function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  mountMcpHttp(app, assembleMcpServer([pingProvider()]));
  return app;
}

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

/**
 * The transport's default response mode is an SSE stream (`text/event-stream`,
 * one `data: <json>` line per message), not a bare JSON body — so `res.body`
 * is unusable here. Pulls the JSON-RPC payload out of the raw SSE text.
 */
function parseSseJsonRpcBody(sseText: string): { jsonrpc: string; result?: Record<string, unknown> } {
  const dataLine = sseText.split('\n').find((line) => line.startsWith('data: '));
  if (dataLine === undefined) {
    throw new Error(`no SSE "data:" line found in response body: ${sseText}`);
  }
  return JSON.parse(dataLine.slice('data: '.length)) as { jsonrpc: string; result?: Record<string, unknown> };
}

describe('mountMcpHttp', () => {
  it('initializes a session on POST /mcp', async () => {
    const res = await request(buildApp())
      .post('/mcp')
      .set('Accept', MCP_ACCEPT)
      .set('Content-Type', 'application/json')
      .send(initializeBody());

    expect(res.status).toBe(200);
    const body = parseSseJsonRpcBody(res.text);
    expect(body.jsonrpc).toBe('2.0');
    expect(body.result?.serverInfo).toMatchObject({ name: 'workspec-mcp' });
  });

  it('mounts at a custom path', async () => {
    const app = express();
    app.use(express.json());
    mountMcpHttp(app, assembleMcpServer([pingProvider()]), { path: '/custom-mcp' });

    const res = await request(app)
      .post('/custom-mcp')
      .set('Accept', MCP_ACCEPT)
      .set('Content-Type', 'application/json')
      .send(initializeBody());

    expect(res.status).toBe(200);
  });

  it('rejects GET and DELETE with 405 (stateless — no session to act on)', async () => {
    const app = buildApp();

    const getRes = await request(app).get('/mcp').set('Accept', MCP_ACCEPT);
    const deleteRes = await request(app).delete('/mcp').set('Accept', MCP_ACCEPT);

    expect(getRes.status).toBe(405);
    expect(deleteRes.status).toBe(405);
  });

  it('serves sequential requests on the same mounted server', async () => {
    const app = buildApp();

    const first = await request(app)
      .post('/mcp')
      .set('Accept', MCP_ACCEPT)
      .set('Content-Type', 'application/json')
      .send(initializeBody());
    const second = await request(app)
      .post('/mcp')
      .set('Accept', MCP_ACCEPT)
      .set('Content-Type', 'application/json')
      .send({ ...initializeBody(), id: 2 });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
  });

  it('rejects a hostile Host header with 403 before any transport sees it', async () => {
    const res = await request(buildApp())
      .post('/mcp')
      .set('Host', 'evil.com')
      .set('Accept', MCP_ACCEPT)
      .set('Content-Type', 'application/json')
      .send(initializeBody());

    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/Invalid Host header/);
  });

  it('rejects a hostile cross-origin Origin header with 403', async () => {
    // Host looks local, but the Origin is cross-site — the backstop that
    // stops a browser page on evil.com from driving the MCP endpoint.
    const res = await request(buildApp())
      .post('/mcp')
      .set('Origin', 'https://evil.com')
      .set('Accept', MCP_ACCEPT)
      .set('Content-Type', 'application/json')
      .send(initializeBody());

    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/Invalid Origin header/);
  });

  it('allows a same-origin localhost Origin', async () => {
    const res = await request(buildApp())
      .post('/mcp')
      .set('Origin', 'http://127.0.0.1:4173')
      .set('Accept', MCP_ACCEPT)
      .set('Content-Type', 'application/json')
      .send(initializeBody());

    expect(res.status).toBe(200);
  });

  it('drives a real tools/call over HTTP end-to-end (queue + wire-name routing)', async () => {
    const res = await request(buildApp())
      .post('/mcp')
      .set('Accept', MCP_ACCEPT)
      .set('Content-Type', 'application/json')
      .send({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'alpha_ping', arguments: {} } });

    expect(res.status).toBe(200);
    const body = parseSseJsonRpcBody(res.text);
    const result = body.result as unknown as { content: { type: string; text: string }[] } | undefined;
    expect(result?.content).toEqual([{ type: 'text', text: 'pong' }]);
  });
});
