import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Decision } from '@workspec/decision-schema';
import { FsRepository } from './fs-repository.js';
import { createDecisionMcpProvider } from './mcp-provider.js';

const decision: Decision = {
  apiVersion: 'workspec.io/v1alpha1',
  kind: 'Decision',
  metadata: { slug: 'database' },
  spec: {
    title: 'Choose a database',
    status: 'accepted',
    context: 'A durable store is required.',
    decision: 'Use PostgreSQL.',
  },
};

describe('Decision MCP surface', () => {
  let directory: string | undefined;
  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it('exposes only core list/read/write/validate/render tools', async () => {
    directory = await mkdtemp(join(tmpdir(), 'decision-mcp-'));
    const repository = new FsRepository(directory);
    const ref = '.workspec/decisions/database.yaml';
    await repository.writeDecision(ref, decision);
    const provider = createDecisionMcpProvider(repository);
    expect(provider.tools.map((tool) => tool.name)).toEqual([
      'list_decisions',
      'read_decision',
      'write_decision',
      'validate',
      'render_adr',
    ]);

    const render = provider.tools.find((tool) => tool.name === 'render_adr');
    if (render === undefined) throw new Error('render_adr tool missing');
    const result = await render.handler({ decision: ref });
    expect(result.isError).not.toBe(true);
    const content = result.content[0];
    if (content?.type !== 'text') throw new Error('render_adr did not return text');
    expect(content.text).toContain('# Choose a database');
    expect(content.text).toContain('Use PostgreSQL.');
  });
});
