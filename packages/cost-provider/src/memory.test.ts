import { describe, expect, it } from 'vitest';
import {
  InventoryArtifact,
  SpendArtifact,
  TagPlanArtifact,
  serializeInventoryYaml,
  serializeSpendYaml,
} from '@workspec/cost-schema';
import type { Inventory, InventoryResourceType, Spend, TagPlan } from '@workspec/cost-schema';
import { createMemoryProvider, DEFAULT_MEMORY_CLOCK } from './index.js';

// ── Fixture builders ─────────────────────────────────────────────────────

function resource(
  id: string,
  subscription: string,
  tags?: Record<string, string>,
): InventoryResourceType {
  return {
    id,
    name: `Resource ${id}`,
    type: 'Microsoft.Compute/virtualMachines',
    location: 'australiaeast',
    resourceGroup: 'rg-1',
    subscription,
    ...(tags !== undefined ? { tags } : {}),
  };
}

function seedInventory(): Inventory {
  const candidate: Inventory = {
    apiVersion: 'workspec.io/v1alpha1',
    kind: 'Inventory',
    metadata: { id: 'seed-2024-01' },
    spec: {
      asOf: '2023-12-01T00:00:00.000Z',
      scope: { subscriptions: ['sub-1', 'sub-2'] },
      resources: [
        resource('id-a', 'sub-1', { env: 'prod' }),
        resource('id-b', 'sub-1', { env: 'dev', team: 'atrium' }),
        resource('id-c', 'sub-2'),
      ],
    },
  };
  const result = InventoryArtifact.safeParse(candidate);
  if (!result.success) throw new Error('bad test fixture: seedInventory');
  return result.data;
}

function seedSpend(): Spend {
  const candidate: Spend = {
    apiVersion: 'workspec.io/v1alpha1',
    kind: 'Spend',
    metadata: { id: 'seed-spend' },
    spec: {
      rows: [
        {
          amount: 5,
          currency: 'NZD',
          period: '2024-01',
          serviceCategory: 'Reservations',
          unresolved: true,
          sourceLabel: 'Reservation',
        },
        { resourceId: 'id-a', amount: 100, currency: 'NZD', period: '2024-01', serviceCategory: 'Compute' },
        { resourceId: 'id-a', amount: 110, currency: 'NZD', period: '2024-02', serviceCategory: 'Compute' },
        { resourceId: 'id-b', amount: 20, currency: 'NZD', period: '2024-01', serviceCategory: 'Storage' },
      ],
    },
  };
  const result = SpendArtifact.safeParse(candidate);
  if (!result.success) throw new Error('bad test fixture: seedSpend');
  return result.data;
}

function tagPlan(baselineAsOf: string): TagPlan {
  const candidate: TagPlan = {
    apiVersion: 'workspec.io/v1alpha1',
    kind: 'TagPlan',
    metadata: { id: 'plan-1' },
    spec: {
      baselineAsOf,
      tagMapping: { product: 'env' },
      entries: [
        { resourceId: 'id-a', tag: 'env', current: 'prod', desired: 'staging', action: 'change' },
        { resourceId: 'id-b', tag: 'env', current: 'dev', desired: 'dev', action: 'noop' },
        { resourceId: 'id-b', tag: 'team', current: 'atrium', desired: null, action: 'remove' },
        { resourceId: 'id-c', tag: 'env', current: null, desired: 'prod', action: 'add' },
      ],
    },
  };
  const result = TagPlanArtifact.safeParse(candidate);
  if (!result.success) throw new Error('bad test fixture: tagPlan');
  return result.data;
}

const SCOPE = { subscriptions: ['sub-1', 'sub-2'] };

describe('createMemoryProvider — fetchInventory', () => {
  it('returns resources sorted by id, filtered to scope, with the (default, fixed) clock as asOf', async () => {
    const provider = createMemoryProvider({ inventory: seedInventory() });
    const inventory = await provider.fetchInventory(SCOPE);

    expect(inventory.spec.asOf).toBe(DEFAULT_MEMORY_CLOCK());
    expect(inventory.spec.resources.map((r) => r.id)).toEqual(['id-a', 'id-b', 'id-c']);
    expect(inventory.spec.scope.subscriptions).toEqual(['sub-1', 'sub-2']);
    // What fetchInventory returns is itself already schema-valid.
    expect(InventoryArtifact.safeParse(inventory).success).toBe(true);
  });

  it('filters resources down to the requested scope', async () => {
    const provider = createMemoryProvider({ inventory: seedInventory() });
    const inventory = await provider.fetchInventory({ subscriptions: ['sub-1'] });

    expect(inventory.spec.resources.map((r) => r.id)).toEqual(['id-a', 'id-b']);
  });

  it('is deterministic: two identically-seeded providers serialize byte-identical inventories', async () => {
    const providerA = createMemoryProvider({ inventory: seedInventory() });
    const providerB = createMemoryProvider({ inventory: seedInventory() });

    const [inventoryA, inventoryB] = await Promise.all([
      providerA.fetchInventory(SCOPE),
      providerB.fetchInventory(SCOPE),
    ]);

    expect(serializeInventoryYaml(inventoryA)).toBe(serializeInventoryYaml(inventoryB));
  });
});

describe('createMemoryProvider — fetchSpend', () => {
  it('returns seeded rows for the requested period only, sorted per the sort-order contract', async () => {
    const provider = createMemoryProvider({ inventory: seedInventory(), spend: [seedSpend()] });
    const spend = await provider.fetchSpend(SCOPE, '2024-01');

    expect(spend.spec.rows.map((r) => r.resourceId ?? r.sourceLabel)).toEqual(['Reservation', 'id-a', 'id-b']);
    expect(spend.spec.rows.find((r) => r.unresolved)?.sourceLabel).toBe('Reservation');
    expect(SpendArtifact.safeParse(spend).success).toBe(true);
  });

  it('returns an empty (still schema-valid) Spend for a period with no rows', async () => {
    const provider = createMemoryProvider({ inventory: seedInventory(), spend: [seedSpend()] });
    const spend = await provider.fetchSpend(SCOPE, '2024-03');

    expect(spend.spec.rows).toEqual([]);
  });

  it('is deterministic: two identically-seeded providers serialize byte-identical spend', async () => {
    const providerA = createMemoryProvider({ inventory: seedInventory(), spend: [seedSpend()] });
    const providerB = createMemoryProvider({ inventory: seedInventory(), spend: [seedSpend()] });

    const [spendA, spendB] = await Promise.all([
      providerA.fetchSpend(SCOPE, '2024-01'),
      providerB.fetchSpend(SCOPE, '2024-01'),
    ]);

    expect(serializeSpendYaml(spendA)).toBe(serializeSpendYaml(spendB));
  });
});

describe('createMemoryProvider — the CLI loop: stocktake -> plan -> apply -> re-stocktake', () => {
  it('converges live tags on the plan, skipping noop and counting each action', async () => {
    const provider = createMemoryProvider({ inventory: seedInventory() });
    const baseline = await provider.fetchInventory(SCOPE);
    const plan = tagPlan(baseline.spec.asOf);

    const result = await provider.applyTags(plan);

    expect(result.dryRun).toBe(false);
    expect(result.applied).toBe(3);
    expect(result.skippedNoop).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.results.every((r) => r.ok)).toBe(true);

    const after = await provider.fetchInventory(SCOPE);
    const byId = new Map(after.spec.resources.map((r) => [r.id, r]));
    expect(byId.get('id-a')?.tags).toEqual({ env: 'staging' });
    expect(byId.get('id-b')?.tags).toEqual({ env: 'dev' }); // team removed, env untouched (noop)
    expect(byId.get('id-c')?.tags).toEqual({ env: 'prod' });
  });

  it('dryRun reports what would happen but mutates nothing', async () => {
    const provider = createMemoryProvider({ inventory: seedInventory() });
    const baseline = await provider.fetchInventory(SCOPE);
    const plan = tagPlan(baseline.spec.asOf);

    const result = await provider.applyTags(plan, { dryRun: true });

    expect(result.dryRun).toBe(true);
    expect(result.applied).toBe(3);
    expect(result.skippedNoop).toBe(1);
    expect(result.failed).toBe(0);

    const after = await provider.fetchInventory(SCOPE);
    const byId = new Map(after.spec.resources.map((r) => [r.id, r]));
    expect(byId.get('id-a')?.tags).toEqual({ env: 'prod' });
    expect(byId.get('id-b')?.tags).toEqual({ env: 'dev', team: 'atrium' });
    expect(byId.get('id-c')?.tags).toBeUndefined();
  });

  it('continues past a per-entry failure (unknown resource) and reports it', async () => {
    const provider = createMemoryProvider({ inventory: seedInventory() });
    const baseline = await provider.fetchInventory(SCOPE);
    const plan: TagPlan = {
      ...tagPlan(baseline.spec.asOf),
      spec: {
        ...tagPlan(baseline.spec.asOf).spec,
        entries: [{ resourceId: 'id-zzz', tag: 'env', current: null, desired: 'prod', action: 'add' }],
      },
    };

    const result = await provider.applyTags(plan);

    expect(result.applied).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.results[0]?.ok).toBe(false);
    expect(result.results[0]?.error).toMatch(/id-zzz/);
  });

  it('rejects a structurally invalid TagPlan rather than throwing synchronously', async () => {
    const provider = createMemoryProvider({ inventory: seedInventory() });
    const invalidPlan = { not: 'a tag plan' } as unknown as TagPlan;

    await expect(provider.applyTags(invalidPlan)).rejects.toThrow(/invalid TagPlan/);
  });

  it('remove is value-matched: reports failure (and leaves the tag untouched) when live has drifted from the plan\'s recorded current', async () => {
    const provider = createMemoryProvider({ inventory: seedInventory() });
    const baseline = await provider.fetchInventory(SCOPE);

    // Simulate someone hand-editing id-b's `team` tag outside WorkSpec,
    // after the plan below was computed against `atrium`.
    provider.mutateLive('id-b', { env: 'dev', team: 'someone-else' });

    const removePlan: TagPlan = {
      ...tagPlan(baseline.spec.asOf),
      spec: {
        ...tagPlan(baseline.spec.asOf).spec,
        entries: [{ resourceId: 'id-b', tag: 'team', current: 'atrium', desired: null, action: 'remove' }],
      },
    };

    const result = await provider.applyTags(removePlan);

    expect(result.applied).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.results[0]?.ok).toBe(false);
    expect(result.results[0]?.error).toMatch(/value-matched/);
    expect(result.results[0]?.error).toMatch(/someone-else/);

    const after = await provider.fetchInventory(SCOPE);
    expect(after.spec.resources.find((r) => r.id === 'id-b')?.tags).toEqual({ env: 'dev', team: 'someone-else' });
  });

  it('remove succeeds (value matches) and dryRun previews a value-matched mismatch as would-fail without mutating', async () => {
    const provider = createMemoryProvider({ inventory: seedInventory() });
    const baseline = await provider.fetchInventory(SCOPE);
    provider.mutateLive('id-b', { env: 'dev', team: 'someone-else' });

    const removePlan: TagPlan = {
      ...tagPlan(baseline.spec.asOf),
      spec: {
        ...tagPlan(baseline.spec.asOf).spec,
        entries: [{ resourceId: 'id-b', tag: 'team', current: 'atrium', desired: null, action: 'remove' }],
      },
    };

    const result = await provider.applyTags(removePlan, { dryRun: true });

    expect(result.dryRun).toBe(true);
    expect(result.applied).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.results[0]?.ok).toBe(false);

    const after = await provider.fetchInventory(SCOPE);
    expect(after.spec.resources.find((r) => r.id === 'id-b')?.tags).toEqual({ env: 'dev', team: 'someone-else' }); // untouched
  });
});

describe('createMemoryProvider — verifyBaseline', () => {
  it('reports inSync when nothing has changed', async () => {
    const provider = createMemoryProvider({ inventory: seedInventory() });
    const baseline = await provider.fetchInventory(SCOPE);

    const report = await provider.verifyBaseline(baseline);

    expect(report).toEqual({ inSync: true, drifts: [] });
  });

  it('detects tags-changed drift injected via mutateLive', async () => {
    const provider = createMemoryProvider({ inventory: seedInventory() });
    const baseline = await provider.fetchInventory(SCOPE);

    provider.mutateLive('id-a', { env: 'prod', extra: 'unexpected' });

    const report = await provider.verifyBaseline(baseline);

    expect(report.inSync).toBe(false);
    expect(report.drifts).toEqual([
      { kind: 'tags-changed', resourceId: 'id-a', detail: expect.stringContaining('extra') },
    ]);
  });

  it('detects resource-disappeared drift injected via mutateLive(id, null)', async () => {
    const provider = createMemoryProvider({ inventory: seedInventory() });
    const baseline = await provider.fetchInventory(SCOPE);

    provider.mutateLive('id-b', null);

    const report = await provider.verifyBaseline(baseline);

    expect(report.inSync).toBe(false);
    expect(report.drifts).toEqual([
      { kind: 'resource-disappeared', resourceId: 'id-b', detail: expect.any(String) },
    ]);
  });

  it('detects resource-appeared drift only when resourceIds names the new id explicitly', async () => {
    const provider = createMemoryProvider({ inventory: seedInventory() });
    const baseline = await provider.fetchInventory(SCOPE);

    provider.addLiveResource(resource('id-z', 'sub-1', { env: 'prod' }));

    // Default target set is the baseline's own resources: a brand-new id is invisible.
    const withoutRestriction = await provider.verifyBaseline(baseline);
    expect(withoutRestriction).toEqual({ inSync: true, drifts: [] });

    // Naming it via resourceIds surfaces it.
    const ids = [...baseline.spec.resources.map((r) => r.id), 'id-z'];
    const withRestriction = await provider.verifyBaseline(baseline, ids);
    expect(withRestriction.inSync).toBe(false);
    expect(withRestriction.drifts).toEqual([
      { kind: 'resource-appeared', resourceId: 'id-z', detail: expect.any(String) },
    ]);
  });

  it('rejects an invalid baseline Inventory', async () => {
    const provider = createMemoryProvider({ inventory: seedInventory() });
    const invalidBaseline = { not: 'an inventory' } as unknown as Inventory;

    await expect(provider.verifyBaseline(invalidBaseline)).rejects.toThrow(/invalid baseline Inventory/);
  });
});

describe('createMemoryProvider — test-only live-state escape hatches', () => {
  it('mutateLive validates tags the same way the schema would', () => {
    const provider = createMemoryProvider({ inventory: seedInventory() });
    expect(() => provider.mutateLive('id-a', { 'bad<name': 'x' })).toThrow();
  });

  it('mutateLive throws for a resourceId that is not currently live', () => {
    const provider = createMemoryProvider({ inventory: seedInventory() });
    expect(() => provider.mutateLive('id-nope', { env: 'x' })).toThrow(/no live resource/);
  });

  it('addLiveResource validates the resource the same way the schema would', () => {
    const provider = createMemoryProvider({ inventory: seedInventory() });
    expect(() => provider.addLiveResource(resource('id-bad', ''))).toThrow();
  });
});

describe('createMemoryProvider — seed validation', () => {
  it('throws synchronously for an invalid seed inventory', () => {
    const badInventory = { not: 'an inventory' } as unknown as Inventory;
    expect(() => createMemoryProvider({ inventory: badInventory })).toThrow(/invalid seed inventory/);
  });

  it('throws synchronously for an invalid seed spend entry', () => {
    const badSpend = { not: 'a spend' } as unknown as Spend;
    expect(() => createMemoryProvider({ inventory: seedInventory(), spend: [badSpend] })).toThrow(
      /invalid seed spend/,
    );
  });
});

describe('createMemoryProvider — isolation from external mutation', () => {
  it('does not leak a seed mutation made after construction', async () => {
    const seed = seedInventory();
    const provider = createMemoryProvider({ inventory: seed });

    // Mutate the seed object AFTER construction — the double must already
    // have deep-cloned it on the way in, so this must not be visible.
    const seedResourceA = seed.spec.resources.find((r) => r.id === 'id-a');
    if (seedResourceA === undefined) throw new Error('bad test fixture: seedInventory');
    seedResourceA.tags = { env: 'tampered' };
    seed.spec.resources.push(resource('id-injected', 'sub-1', { env: 'x' }));

    const inventory = await provider.fetchInventory(SCOPE);
    expect(inventory.spec.resources.map((r) => r.id)).toEqual(['id-a', 'id-b', 'id-c']);
    expect(inventory.spec.resources.find((r) => r.id === 'id-a')?.tags).toEqual({ env: 'prod' });
  });

  it('deep-clones on read: mutating a fetched inventory does not affect a subsequent fetch', async () => {
    const provider = createMemoryProvider({ inventory: seedInventory() });

    const first = await provider.fetchInventory(SCOPE);
    // Mutate the RETURNED artifact, not the double's internal state.
    const firstResourceA = first.spec.resources.find((r) => r.id === 'id-a');
    if (firstResourceA === undefined) throw new Error('bad test fixture: seedInventory');
    firstResourceA.tags = { env: 'tampered' };
    first.spec.resources.push(resource('id-injected', 'sub-1', { env: 'x' }));

    const second = await provider.fetchInventory(SCOPE);
    expect(second.spec.resources.map((r) => r.id)).toEqual(['id-a', 'id-b', 'id-c']);
    expect(second.spec.resources.find((r) => r.id === 'id-a')?.tags).toEqual({ env: 'prod' });
  });
});
