import { describe, expect, it } from 'vitest';
import { COST_REPOSITORY_METHODS, createMemoryRepository } from './repository.js';
import type { CostRepositoryPort } from './repository.js';
import type { Inventory } from './inventory.js';
import type { Spend } from './spend.js';
import type { Attribution } from './attribution.js';
import type { TagPlan } from './tagplan.js';

/** Narrows a possibly-undefined lookup/index result, failing the test loudly if absent. */
function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('expected value to be defined');
  return value;
}

// ── Fixtures are factory-built, never shared mutable module state ─────────────

/** Overrides split across `metadata.slug` and `spec.name` — the post-migration identity shape. */
interface IdentityOverrides {
  slug?: string;
  name?: string;
}

function makeInventory(overrides: IdentityOverrides = {}): Inventory {
  const slug = overrides.slug ?? 'inv-min';
  return {
    apiVersion: 'workspec.io/v1alpha1',
    kind: 'Inventory',
    metadata: { slug },
    spec: {
      ...(overrides.name !== undefined ? { name: overrides.name } : {}),
      asOf: '2026-07-01T00:00:00.000Z',
      scope: { subscriptions: ['sub-1'] },
      resources: [
        {
          id: 'res-1',
          name: 'Resource One',
          type: 'Microsoft.Compute/virtualMachines',
          location: 'australiaeast',
          resourceGroup: 'rg-1',
          subscription: 'sub-1',
        },
      ],
    },
  } as Inventory;
}

function makeSpend(overrides: IdentityOverrides = {}): Spend {
  const slug = overrides.slug ?? 'spend-min';
  return {
    apiVersion: 'workspec.io/v1alpha1',
    kind: 'Spend',
    metadata: { slug },
    spec: {
      ...(overrides.name !== undefined ? { name: overrides.name } : {}),
      rows: [
        {
          resourceId: 'res-1',
          amount: 10,
          currency: 'NZD',
          period: '2026-07',
          serviceCategory: 'Virtual Machines',
        },
      ],
    },
  } as Spend;
}

function makeAttribution(overrides: IdentityOverrides = {}): Attribution {
  const slug = overrides.slug ?? 'attr-min';
  return {
    apiVersion: 'workspec.io/v1alpha1',
    kind: 'Attribution',
    metadata: { slug },
    spec: {
      ...(overrides.name !== undefined ? { name: overrides.name } : {}),
      dimensions: [{ id: 'product', label: 'Product', values: ['atrium'] }],
      rules: [{ id: 'r1', name: 'Catch-all', match: {}, assign: { product: 'atrium' } }],
    },
  } as Attribution;
}

function makeTagPlan(overrides: IdentityOverrides = {}): TagPlan {
  const slug = overrides.slug ?? 'plan-min';
  return {
    apiVersion: 'workspec.io/v1alpha1',
    kind: 'TagPlan',
    metadata: { slug },
    spec: {
      ...(overrides.name !== undefined ? { name: overrides.name } : {}),
      baselineAsOf: '2026-07-01T00:00:00.000Z',
      tagMapping: { product: 'fs-product' },
      entries: [
        { resourceId: 'res-1', tag: 'fs-product', current: null, desired: 'atrium', action: 'add' },
      ],
    },
  } as TagPlan;
}

describe('CostRepositoryPort surface', () => {
  it('names exactly the twelve methods', () => {
    expect(COST_REPOSITORY_METHODS).toHaveLength(12);
    expect([...COST_REPOSITORY_METHODS].sort()).toEqual(
      [
        'listInventories',
        'readInventory',
        'writeInventory',
        'listSpends',
        'readSpend',
        'writeSpend',
        'listAttributions',
        'readAttribution',
        'writeAttribution',
        'listTagPlans',
        'readTagPlan',
        'writeTagPlan',
      ].sort(),
    );
  });

  it('the memory implementation exposes exactly the twelve port methods and no more', () => {
    const repo = createMemoryRepository();
    expect(Object.keys(repo).sort()).toEqual([...COST_REPOSITORY_METHODS].sort());
  });

  it('is type-compatible with CostRepositoryPort (compile-time conformance)', () => {
    // A typed record whose keys are exactly `keyof CostRepositoryPort`: adding
    // a thirteenth method to the port (or removing one) breaks this literal.
    const surface: Record<keyof CostRepositoryPort, true> = {
      listInventories: true,
      readInventory: true,
      writeInventory: true,
      listSpends: true,
      readSpend: true,
      writeSpend: true,
      listAttributions: true,
      readAttribution: true,
      writeAttribution: true,
      listTagPlans: true,
      readTagPlan: true,
      writeTagPlan: true,
    };
    expect(Object.keys(surface)).toHaveLength(12);
    const repo: CostRepositoryPort = createMemoryRepository();
    expect(repo).toBeDefined();
  });
});

describe('createMemoryRepository', () => {
  it('lists seeded inventories with { ref, slug, name }', async () => {
    const repo = createMemoryRepository({
      inventories: { 'a.inventory.yaml': makeInventory({ name: 'Prod estate' }) },
    });
    const list = await repo.listInventories();
    expect(list).toEqual([{ ref: 'a.inventory.yaml', slug: 'inv-min', name: 'Prod estate' }]);
  });

  it('lists seeded spends with { ref, slug, name }', async () => {
    const repo = createMemoryRepository({ spends: { 'a.spend.yaml': makeSpend() } });
    const list = await repo.listSpends();
    expect(list).toEqual([{ ref: 'a.spend.yaml', slug: 'spend-min' }]);
  });

  it('lists seeded attributions with { ref, slug, name }', async () => {
    const repo = createMemoryRepository({
      attributions: { 'a.attribution.yaml': makeAttribution({ name: 'Prod attribution' }) },
    });
    const list = await repo.listAttributions();
    expect(list).toEqual([
      { ref: 'a.attribution.yaml', slug: 'attr-min', name: 'Prod attribution' },
    ]);
  });

  it('lists seeded tag plans with { ref, slug, name }', async () => {
    const repo = createMemoryRepository({ tagPlans: { 'a.tagplan.yaml': makeTagPlan() } });
    const list = await repo.listTagPlans();
    expect(list).toEqual([{ ref: 'a.tagplan.yaml', slug: 'plan-min' }]);
  });

  it('round-trips a written artifact of each kind', async () => {
    const repo = createMemoryRepository();

    await repo.writeInventory('i.inventory.yaml', makeInventory());
    expect((await repo.readInventory('i.inventory.yaml')).metadata.slug).toBe('inv-min');
    expect(await repo.listInventories()).toHaveLength(1);

    await repo.writeSpend('s.spend.yaml', makeSpend());
    expect((await repo.readSpend('s.spend.yaml')).metadata.slug).toBe('spend-min');
    expect(await repo.listSpends()).toHaveLength(1);

    await repo.writeAttribution('at.attribution.yaml', makeAttribution());
    expect((await repo.readAttribution('at.attribution.yaml')).metadata.slug).toBe('attr-min');
    expect(await repo.listAttributions()).toHaveLength(1);

    await repo.writeTagPlan('tp.tagplan.yaml', makeTagPlan());
    expect((await repo.readTagPlan('tp.tagplan.yaml')).metadata.slug).toBe('plan-min');
    expect(await repo.listTagPlans()).toHaveLength(1);
  });

  it('rejects reads of unknown refs', async () => {
    const repo = createMemoryRepository();
    await expect(repo.readInventory('missing.inventory.yaml')).rejects.toThrow(/no inventory/);
    await expect(repo.readSpend('missing.spend.yaml')).rejects.toThrow(/no spend/);
    await expect(repo.readAttribution('missing.attribution.yaml')).rejects.toThrow(
      /no attribution/,
    );
    await expect(repo.readTagPlan('missing.tagplan.yaml')).rejects.toThrow(/no tag plan/);
  });

  it('validates through Zod on write', async () => {
    const repo = createMemoryRepository();
    const bad = makeInventory();
    // Corrupt a required invariant: duplicate resource ids.
    bad.spec.resources.push({ ...must(bad.spec.resources[0]) });
    await expect(repo.writeInventory('bad.inventory.yaml', bad)).rejects.toThrow(
      /invalid inventory/,
    );
  });

  it('returns deep clones so external mutation cannot corrupt the store', async () => {
    const repo = createMemoryRepository({
      inventories: { 'a.inventory.yaml': makeInventory({ name: 'Original' }) },
    });
    const first = await repo.readInventory('a.inventory.yaml');
    first.spec.name = 'MUTATED';
    const second = await repo.readInventory('a.inventory.yaml');
    expect(second.spec.name).toBe('Original');
  });

  it('is isolated per factory call (no shared fixture)', async () => {
    const a = createMemoryRepository({ inventories: { 'x.inventory.yaml': makeInventory() } });
    const b = createMemoryRepository();
    expect(await a.listInventories()).toHaveLength(1);
    expect(await b.listInventories()).toHaveLength(0);
  });
});
