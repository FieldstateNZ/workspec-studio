import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Inventory, InventoryResourceType, Spend, SpendRowType, TagPlanEntryType } from '@workspec/cost-schema';
import { attribute, plan, resolveAttribution } from './index.js';
import type { TagMapping } from './index.js';
import { buildDemoAttribution, buildDemoInventory, TAG_MAPPING } from './demo-estate.fixture.js';

// Property tests seeded from the fieldstate-azure demo estate (80 resources,
// the real r1-r8 rules, the vm-old-jenkins override) — same
// arbitraries-seeded-from-fixture style as decision-engine's property.test.ts.

const inventory: Inventory = buildDemoInventory();
const attribution = buildDemoAttribution();
const resourceIds = inventory.spec.resources.map((r) => r.id);

function spendDocOf(rows: SpendRowType[]): Spend {
  return { apiVersion: 'workspec.io/v1alpha1', kind: 'Spend', metadata: { id: 'prop' }, spec: { rows } };
}

/** An arbitrary spend row for one of the demo's 80 resources, integer amount 0..5000. */
function spendRowArb(resourceId: string): fc.Arbitrary<SpendRowType> {
  return fc.integer({ min: 0, max: 5000 }).map((amount) => ({
    resourceId,
    amount,
    currency: 'USD',
    period: '2026-07',
    serviceCategory: 'X',
  }));
}

/** One arbitrary spend row per demo resource, in inventory order. */
const spendRowsArb: fc.Arbitrary<SpendRowType[]> = fc.tuple(...resourceIds.map(spendRowArb));

function sum(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

describe('property: rollup conservation', () => {
  it('for every dimension, the sum of rollup buckets equals the sum of joined resource spend', () => {
    fc.assert(
      fc.property(spendRowsArb, (rows) => {
        const result = attribute(inventory, [spendDocOf(rows)], attribution);
        for (const rollup of result.rollups) {
          const bucketTotal = sum(rollup.buckets.map((b) => b.amount));
          expect(bucketTotal).toBeCloseTo(result.totals.inventorySpend, 6);
        }
      }),
      { numRuns: 50 },
    );
  });
});

describe('property: split conservation', () => {
  const aksId = inventory.spec.resources.find((r) => r.name === 'aks-shared')?.id;
  if (aksId === undefined) throw new Error('fixture missing aks-shared');
  // The resolution (and therefore the split assignment) does not depend on
  // spend at all — compute it once outside the property.
  const { resolutions } = resolveAttribution(inventory, attribution);
  const aksResolution = resolutions.find((r) => r.resourceId === aksId);
  const aksAssignment = aksResolution?.assignments['product'];
  if (aksAssignment?.kind !== 'split') throw new Error('fixture: aks-shared must resolve to a split assignment');
  const parts = aksAssignment.parts;

  it("aks-shared's spend distributes to exactly its split parts, summing to its own spend", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100000 }), (amount) => {
        const rows: SpendRowType[] = resourceIds.map((id) => ({
          resourceId: id,
          amount: id === aksId ? amount : 0,
          currency: 'USD',
          period: '2026-07',
          serviceCategory: 'X',
        }));
        const result = attribute(inventory, [spendDocOf(rows)], attribution);
        const rollup = result.rollups.find((r) => r.dimensionId === 'product');
        if (rollup === undefined) throw new Error('unreachable: product rollup always present');

        const partsTotal = sum(parts.map((part) => amount * part.ratio));
        expect(partsTotal).toBeCloseTo(amount, 6);

        // Every part's ratio-weighted share must have landed in its own bucket
        // (nothing else contributes to workspec/atrium here since every other
        // resource's spend is pinned to 0 in this scenario).
        for (const part of parts) {
          const bucket = rollup.buckets.find((b) => b.key === part.value);
          expect(bucket?.amount ?? 0).toBeCloseTo(amount * part.ratio, 6);
        }
      }),
      { numRuns: 30 },
    );
  });
});

describe('property: attribute() is deterministic under spend-row order permutation', () => {
  it('permuting spend rows (sort-contract aside — this calls the pure function directly) yields the identical result', () => {
    fc.assert(
      fc.property(spendRowsArb, fc.shuffledSubarray(resourceIds, { minLength: resourceIds.length, maxLength: resourceIds.length }), (rows, order) => {
        const byId = new Map(rows.map((r) => [r.resourceId, r]));
        const permuted = order.map((id) => {
          const row = byId.get(id);
          if (row === undefined) throw new Error('unreachable: order is a permutation of resourceIds');
          return row;
        });
        const original = attribute(inventory, [spendDocOf(rows)], attribution);
        const shuffled = attribute(inventory, [spendDocOf(permuted)], attribution);
        expect(shuffled).toEqual(original);
      }),
      { numRuns: 30 },
    );
  });

  it('resolveAttribution never takes spend at all, so it is trivially spend-independent', () => {
    const a = resolveAttribution(inventory, attribution);
    const b = resolveAttribution(inventory, attribution);
    expect(a).toEqual(b);
  });
});

describe('property: plan idempotence', () => {
  function applyPlanToTags(base: Inventory, entries: readonly TagPlanEntryType[]): Inventory {
    const byResourceId = new Map<string, TagPlanEntryType[]>();
    for (const entry of entries) {
      const list = byResourceId.get(entry.resourceId) ?? [];
      list.push(entry);
      byResourceId.set(entry.resourceId, list);
    }
    const resources: InventoryResourceType[] = base.spec.resources.map((resource) => {
      const ops = byResourceId.get(resource.id);
      if (ops === undefined) return resource;
      const tagMap = new Map(Object.entries(resource.tags ?? {}));
      for (const op of ops) {
        if (op.desired === null) tagMap.delete(op.tag);
        else tagMap.set(op.tag, op.desired);
      }
      const { tags: _drop, ...rest } = resource;
      const hasTags = tagMap.size > 0;
      return { ...rest, ...(hasTags ? { tags: Object.fromEntries(tagMap) } : {}) };
    });
    return { ...base, spec: { ...base.spec, resources } };
  }

  const tagMappingEntries = Object.entries(TAG_MAPPING);

  it('applying a plan restricted to an arbitrary non-empty subset of mapped dimensions, then re-planning that same subset, yields only noop entries', () => {
    fc.assert(
      fc.property(fc.subarray(tagMappingEntries, { minLength: 1 }), (subsetEntries) => {
        const subsetMapping: TagMapping = Object.fromEntries(subsetEntries);
        const firstPlan = plan(inventory, attribution, subsetMapping);
        const converged = applyPlanToTags(inventory, firstPlan);
        const secondPlan = plan(converged, attribution, subsetMapping);
        for (const entry of secondPlan) {
          expect(entry.action).toBe('noop');
        }
      }),
      { numRuns: 20 },
    );
  });

  it('does not mutate the original inventory', () => {
    const before = structuredClone(inventory);
    plan(inventory, attribution, TAG_MAPPING);
    expect(inventory).toEqual(before);
  });
});

describe('property: input non-mutation', () => {
  function deepFreeze<T>(value: T): T {
    if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
    }
    return value;
  }

  it('running resolveAttribution / attribute / plan over deep-frozen, arbitrarily permuted inputs never throws', () => {
    fc.assert(
      fc.property(spendRowsArb, fc.shuffledSubarray(resourceIds, { minLength: resourceIds.length, maxLength: resourceIds.length }), (rows, order) => {
        const byId = new Map(rows.map((r) => [r.resourceId, r]));
        const permuted = order.map((id) => {
          const row = byId.get(id);
          if (row === undefined) throw new Error('unreachable: order is a permutation of resourceIds');
          return row;
        });
        const frozenInventory = deepFreeze(structuredClone(inventory));
        const frozenAttribution = deepFreeze(structuredClone(attribution));
        const frozenSpend = deepFreeze(structuredClone(spendDocOf(permuted)));

        expect(() => {
          resolveAttribution(frozenInventory, frozenAttribution);
          attribute(frozenInventory, [frozenSpend], frozenAttribution);
          plan(frozenInventory, frozenAttribution, TAG_MAPPING);
        }).not.toThrow();
      }),
      { numRuns: 20 },
    );
  });
});
