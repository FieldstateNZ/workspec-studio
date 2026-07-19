import { describe, expect, it } from 'vitest';
import { createInertLinkResolver, createMemoryRepository, repositoryId } from './host.js';
import { buildFixtureModel } from './test-helpers/trace-fixture.js';

describe('createInertLinkResolver', () => {
  it('resolves every link as unresolved', () => {
    const resolver = createInertLinkResolver();
    expect(resolver({ kind: 'ci-run', label: 'CI run' })).toEqual({ resolved: false });
  });
});

describe('repositoryId', () => {
  it('assigns a stable id per repository instance', () => {
    const repo = createMemoryRepository({ model: buildFixtureModel() });
    const first = repositoryId(repo);
    const second = repositoryId(repo);
    expect(first).toBe(second);
  });

  it('assigns distinct ids to distinct repository instances', () => {
    const repoA = createMemoryRepository({ model: buildFixtureModel() });
    const repoB = createMemoryRepository({ model: buildFixtureModel() });
    expect(repositoryId(repoA)).not.toBe(repositoryId(repoB));
  });
});

describe('createMemoryRepository', () => {
  it('resolves readModel() to the seeded model', async () => {
    const model = buildFixtureModel();
    const repo = createMemoryRepository({ model });
    await expect(repo.readModel()).resolves.toBe(model);
  });
});
