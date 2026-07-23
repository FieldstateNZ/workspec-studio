// Protocol-boundary tests for `assembleMcpServer`: an in-memory `Client`
// talks to the assembled `Server` over `InMemoryTransport.createLinkedPair()`
// (no real socket, no stdio), the same harness the SDK itself uses for its
// own tests. This exercises the real wire encoding/decoding, not just direct
// function calls against our registry.

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';
import { assembleMcpServer } from './assemble-mcp-server.js';
import type { McpToolProvider } from './mcp-tool.types.js';

const TRIVIAL_INPUT_SCHEMA = { type: 'object', properties: {}, additionalProperties: false };

function pingProvider(): McpToolProvider {
  return {
    namespace: 'alpha',
    tools: [
      {
        name: 'ping',
        description: 'Replies pong.',
        inputSchema: TRIVIAL_INPUT_SCHEMA,
        handler: async () => ({ content: [{ type: 'text', text: 'pong' }] }),
      },
    ],
  };
}

function echoProvider(): McpToolProvider {
  return {
    namespace: 'beta',
    tools: [
      {
        name: 'echo',
        description: 'Echoes back its input.',
        inputSchema: TRIVIAL_INPUT_SCHEMA,
        handler: async (args) => ({ content: [{ type: 'text', text: JSON.stringify(args) }] }),
      },
    ],
  };
}

/** Connects a fresh `Client` to a freshly-assembled server over an in-memory transport pair. */
async function connectClient(providers: McpToolProvider[]): Promise<Client> {
  const server = assembleMcpServer(providers);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return client;
}

describe('assembleMcpServer', () => {
  it('lists tools under namespaced wire names', async () => {
    const client = await connectClient([pingProvider(), echoProvider()]);

    const { tools } = await client.listTools();

    expect(tools.map((t) => t.name).sort()).toEqual(['alpha_ping', 'beta_echo']);
    const ping = tools.find((t) => t.name === 'alpha_ping');
    expect(ping?.description).toBe('Replies pong.');
    expect(ping?.inputSchema).toMatchObject({ type: 'object' });
  });

  it('dispatches tools/call to the matching handler by wire name', async () => {
    const client = await connectClient([pingProvider()]);

    const result = await client.callTool({ name: 'alpha_ping', arguments: {} });

    expect(result.isError).not.toBe(true);
    expect(result.content).toEqual([{ type: 'text', text: 'pong' }]);
  });

  it('throws at assembly time on a duplicate wire name', () => {
    const duplicate: McpToolProvider = {
      namespace: 'alpha',
      tools: [
        {
          name: 'ping',
          description: 'A second, colliding ping.',
          inputSchema: TRIVIAL_INPUT_SCHEMA,
          handler: async () => ({ content: [] }),
        },
      ],
    };

    expect(() => assembleMcpServer([pingProvider(), duplicate])).toThrow(/duplicate/i);
  });

  it('throws at assembly time on an invalid namespace', () => {
    const bad: McpToolProvider = { namespace: 'has-a-dash', tools: [] };

    expect(() => assembleMcpServer([bad])).toThrow(/invalid MCP namespace/i);
  });

  it('throws at assembly time on an invalid tool name', () => {
    const bad: McpToolProvider = {
      namespace: 'alpha',
      tools: [
        {
          name: 'not valid',
          description: 'Bad name.',
          inputSchema: TRIVIAL_INPUT_SCHEMA,
          handler: async () => ({ content: [] }),
        },
      ],
    };

    expect(() => assembleMcpServer([bad])).toThrow(/invalid MCP tool name/i);
  });

  it('surfaces a handler throw as an isError result, not a transport crash', async () => {
    const throwing: McpToolProvider = {
      namespace: 'alpha',
      tools: [
        {
          name: 'boom',
          description: 'Always throws.',
          inputSchema: TRIVIAL_INPUT_SCHEMA,
          handler: async () => {
            throw new Error('kaboom');
          },
        },
      ],
    };
    const client = await connectClient([throwing]);

    const result = await client.callTool({ name: 'alpha_boom', arguments: {} });

    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{ type: 'text', text: 'kaboom' }]);
    // The connection itself is still alive — a second, well-behaved call still works.
    const followUp = await client.listTools();
    expect(followUp.tools.map((t) => t.name)).toEqual(['alpha_boom']);
  });

  it('surfaces an unknown wire name as an isError result', async () => {
    const client = await connectClient([pingProvider()]);

    const result = await client.callTool({ name: 'nope_nope', arguments: {} });

    expect(result.isError).toBe(true);
  });
});
