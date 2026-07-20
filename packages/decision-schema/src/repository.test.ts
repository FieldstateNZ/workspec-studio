import { describe, expect, it } from 'vitest';
import { createMemoryRepository, DECISION_REPOSITORY_METHODS } from './repository.js';
import type { DecisionRepositoryPort } from './repository.js';
import type { Catalog } from './catalog.js';
import type { Decision } from './decision.js';

/** Narrows a possibly-undefined lookup/index result, failing the test loudly if absent. */
function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('expected value to be defined');
  return value;
}

// ── Fixtures are factory-built, never shared mutable module state ─────────────
// Identity is the filename slug (`metadata.slug`, optional per schema-core's
// `MetadataSchema`); these factories write it explicitly so the in-memory
// repository's `list*` output is deterministic across test runs.

function makeDecision(): Decision {
  return {
    apiVersion: 'workspec.io/v1alpha1',
    kind: 'Decision',
    metadata: { slug: 'dec-min' },
    spec: {
      title: 'Minimal decision',
      status: 'exploring',
      context: 'A minimal decision for tests.',
      catalog: 'min',
      currency: 'NZD',
      environments: ['dev', 'prod'],
      criteria: [{ id: 'cost', label: 'Cost', weight: 1 }],
      options: [
        {
          id: 'a',
          name: 'A',
          environments: ['dev', 'prod'],
          lines: [{ id: 'l1', label: 'Line 1', flat: true, amount: { dev: 10, prod: 20 } }],
          scores: { cost: { score: 3 } },
        },
      ],
    },
  } as Decision;
}

function makeCatalog(): Catalog {
  return {
    apiVersion: 'workspec.io/v1alpha1',
    kind: 'Catalog',
    metadata: { slug: 'cat-min' },
    spec: {
      name: 'Minimal catalog',
      currency: 'NZD',
      asOf: '2026-07-01',
      pricingModes: [{ id: 'payg', label: 'PAYG', mult: 1, committed: false }],
      schedules: [{ id: 'always', label: '24x7', pct: 1 }],
      skus: [{ id: 'd4s_v5', label: 'D4s v5', family: 'General compute', price: 190 }],
    },
  } as Catalog;
}

describe('DecisionRepositoryPort surface', () => {
  it('names exactly the six methods', () => {
    expect(DECISION_REPOSITORY_METHODS).toHaveLength(6);
    expect([...DECISION_REPOSITORY_METHODS].sort()).toEqual([
      'listCatalogs',
      'listDecisions',
      'readCatalog',
      'readDecision',
      'writeCatalog',
      'writeDecision',
    ]);
  });

  it('the memory implementation exposes exactly the six port methods and no more', () => {
    const repo = createMemoryRepository();
    expect(Object.keys(repo).sort()).toEqual([...DECISION_REPOSITORY_METHODS].sort());
  });

  it('is type-compatible with DecisionRepositoryPort (compile-time conformance)', () => {
    // A typed record whose keys are exactly `keyof DecisionRepositoryPort`: adding
    // a seventh method to the port (or removing one) breaks this literal.
    const surface: Record<keyof DecisionRepositoryPort, true> = {
      listDecisions: true,
      readDecision: true,
      writeDecision: true,
      listCatalogs: true,
      readCatalog: true,
      writeCatalog: true,
    };
    expect(Object.keys(surface)).toHaveLength(6);
    const repo: DecisionRepositoryPort = createMemoryRepository();
    expect(repo).toBeDefined();
  });
});

describe('createMemoryRepository', () => {
  it('lists seeded decisions with { ref, slug, title }', async () => {
    const repo = createMemoryRepository({ decisions: { 'a.decision.yaml': makeDecision() } });
    const list = await repo.listDecisions();
    expect(list).toEqual([{ ref: 'a.decision.yaml', slug: 'dec-min', title: 'Minimal decision' }]);
  });

  it('lists seeded catalogs with spec.name as title', async () => {
    const repo = createMemoryRepository({ catalogs: { 'min.catalog.yaml': makeCatalog() } });
    const list = await repo.listCatalogs();
    expect(list).toEqual([{ ref: 'min.catalog.yaml', slug: 'cat-min', title: 'Minimal catalog' }]);
  });

  it('round-trips a written decision', async () => {
    const repo = createMemoryRepository();
    await repo.writeDecision('d.decision.yaml', makeDecision());
    const read = await repo.readDecision('d.decision.yaml');
    expect(read.metadata.slug).toBe('dec-min');
    expect(await repo.listDecisions()).toHaveLength(1);
  });

  it('rejects reads of unknown refs', async () => {
    const repo = createMemoryRepository();
    await expect(repo.readDecision('missing.decision.yaml')).rejects.toThrow(/no decision/);
    await expect(repo.readCatalog('missing.catalog.yaml')).rejects.toThrow(/no catalog/);
  });

  it('validates through Zod on write', async () => {
    const repo = createMemoryRepository();
    const bad = makeDecision();
    // Corrupt a required invariant: a score above the 0..5 range.
    (must(bad.spec.options[0]).scores as Record<string, { score: number }>).cost = { score: 9 };
    await expect(repo.writeDecision('bad.decision.yaml', bad)).rejects.toThrow(/invalid decision/);
  });

  it('returns deep clones so external mutation cannot corrupt the store', async () => {
    const repo = createMemoryRepository({ decisions: { 'a.decision.yaml': makeDecision() } });
    const first = await repo.readDecision('a.decision.yaml');
    first.spec.title = 'MUTATED';
    const second = await repo.readDecision('a.decision.yaml');
    expect(second.spec.title).toBe('Minimal decision');
  });

  it('is isolated per factory call (no shared fixture)', async () => {
    const a = createMemoryRepository({ decisions: { 'x.decision.yaml': makeDecision() } });
    const b = createMemoryRepository();
    expect(await a.listDecisions()).toHaveLength(1);
    expect(await b.listDecisions()).toHaveLength(0);
  });
});
