import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Decision } from '@workspec/decision-schema';
import { FsRepository } from './fs-repository.js';

const decision: Decision = {
  apiVersion: 'workspec.io/v1alpha1',
  kind: 'Decision',
  metadata: { slug: 'database' },
  spec: {
    title: 'Choose a database',
    status: 'proposed',
    context: 'A durable transactional store is required.',
    decision: 'Use PostgreSQL.',
  },
};

describe('FsRepository core Decision port', () => {
  let directory: string | undefined;
  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it('lists, writes, validates, and reads repository-native Decisions', async () => {
    directory = await mkdtemp(join(tmpdir(), 'decision-repository-'));
    const repository = new FsRepository(directory);
    const ref = '.workspec/decisions/database.yaml';
    await repository.writeDecision(ref, decision);
    expect(await repository.listDecisions()).toEqual([
      { ref, slug: 'database', title: 'Choose a database' },
    ]);
    expect(await repository.readDecision(ref)).toEqual(decision);
    expect(await readFile(join(directory, ref), 'utf8')).toContain('decision.schema.json');
  });

  it('rejects schema-invalid writes', async () => {
    directory = await mkdtemp(join(tmpdir(), 'decision-repository-'));
    const repository = new FsRepository(directory);
    await expect(
      repository.writeDecision('.workspec/decisions/bad.yaml', {
        ...decision,
        spec: { ...decision.spec, decision: '' },
      }),
    ).rejects.toThrow('expected string');
  });
});
