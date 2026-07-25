// Protocol-boundary tests for the aggregate server: an in-memory `Client`
// talks to `assembleMcpServer(buildAllProviders(dir))` over
// `InMemoryTransport.createLinkedPair()` — the same harness
// `@workspec/mcp-core`'s own `assemble-mcp-server.test.ts` uses (no real
// socket, no stdio). This is the capstone assertion: all four `*-studio`
// providers, constructed once each over ONE shared fixture directory, work
// together behind a single server — not just that each provider's own
// tests pass in isolation.

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { assembleMcpServer } from '@workspec/mcp-core';
import { buildAllProviders } from './assemble.js';
import { buildFixtureTree } from './build-fixture-tree.js';
import type { FixtureTree } from './build-fixture-tree.js';
import { MCP_HOST_SERVER_INFO } from './server-info.js';

/** Connects a fresh `Client` to a freshly-assembled aggregate server over an in-memory transport pair. */
async function connectClient(dir: string): Promise<Client> {
  const server = assembleMcpServer(buildAllProviders(dir), MCP_HOST_SERVER_INFO);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'mcp-host-test-client', version: '0.0.0' });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return client;
}

describe('the aggregate WorkSpec MCP Host server', () => {
  let fixture: FixtureTree;

  beforeEach(async () => {
    fixture = await buildFixtureTree();
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  it('lists tools from all five namespaces with no wire-name collision', async () => {
    const client = await connectClient(fixture.dir);

    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);

    // At least one wire name per namespace prefix is present.
    expect(names.some((n) => n.startsWith('decisions_'))).toBe(true);
    expect(names.some((n) => n.startsWith('cost_'))).toBe(true);
    expect(names.some((n) => n.startsWith('c4_'))).toBe(true);
    expect(names.some((n) => n.startsWith('trace_'))).toBe(true);
    expect(names.some((n) => n.startsWith('topology_'))).toBe(true);

    // No duplicate wire name across the full list — a collision would mean
    // two providers picked the same namespace + tool-name pair.
    expect(new Set(names).size).toBe(names.length);
  });

  it('calls decisions_list_catalogs end to end through the real assembled server', async () => {
    const client = await connectClient(fixture.dir);

    const result = await client.callTool({ name: 'decisions_list_catalogs', arguments: {} });

    expect(result.isError).not.toBe(true);
    const content = result.content as { type: string; text: string }[];
    const body = JSON.parse(content[0]?.text ?? '[]') as unknown[];
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
  });

  it('calls cost_validate end to end through the real assembled server', async () => {
    const client = await connectClient(fixture.dir);

    const result = await client.callTool({ name: 'cost_validate', arguments: {} });

    expect(result.isError).not.toBe(true);
  });

  it('calls trace_verify end to end through the real assembled server', async () => {
    const client = await connectClient(fixture.dir);

    const result = await client.callTool({ name: 'trace_verify', arguments: {} });

    // No system-requirements/scenarios in the fixture tree — trace_verify
    // still returns a real (zero-coverage) report rather than erroring.
    expect(result.isError).not.toBe(true);
  });

  it('calls c4_get_model end to end through the real assembled server', async () => {
    const client = await connectClient(fixture.dir);

    const result = await client.callTool({ name: 'c4_get_model', arguments: {} });

    expect(result.isError).not.toBe(true);
  });

  it('calls topology_list_topologies end to end through the real assembled server', async () => {
    const client = await connectClient(fixture.dir);

    const result = await client.callTool({ name: 'topology_list_topologies', arguments: {} });

    expect(result.isError).not.toBe(true);
    const content = result.content as { type: string; text: string }[];
    const body = JSON.parse(content[0]?.text ?? '[]') as unknown[];
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
  });
});
