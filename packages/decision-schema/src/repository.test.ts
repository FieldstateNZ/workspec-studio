import { describe, expect, it } from 'vitest';
import { createMemoryRepository, DECISION_REPOSITORY_METHODS } from './repository.js';
import type { Decision } from './decision.js';

const decision: Decision = {
  apiVersion: 'workspec.io/v1alpha1',
  kind: 'Decision',
  metadata: { slug: 'use-postgres' },
  spec: {
    title: 'Use PostgreSQL',
    status: 'accepted',
    context: 'A transactional store is required.',
    decision: 'Use PostgreSQL.',
  },
};

describe('DecisionRepositoryPort', () => {
  it('is the three-operation core port', () => {
    expect(DECISION_REPOSITORY_METHODS).toEqual(['listDecisions', 'readDecision', 'writeDecision']);
  });

  it('lists, reads, validates, clones, and writes decisions', async () => {
    const ref = '.workspec/decisions/use-postgres.yaml';
    const repository = createMemoryRepository({ decisions: { [ref]: decision } });
    expect(await repository.listDecisions()).toEqual([
      { ref, slug: 'use-postgres', title: 'Use PostgreSQL' },
    ]);
    const read = await repository.readDecision(ref);
    read.spec.title = 'Changed only in caller';
    expect((await repository.readDecision(ref)).spec.title).toBe('Use PostgreSQL');
    await repository.writeDecision(ref, {
      ...decision,
      spec: { ...decision.spec, status: 'deprecated' },
    });
    expect((await repository.readDecision(ref)).spec.status).toBe('deprecated');
  });
});
