// A compact test estate: 8 resources across 4 resource groups, 3 dimensions,
// 4 rules (assign / split / fromTag / catch-all-assign), and 1 pinned
// override — small enough to hand-verify, rich enough to exercise every
// resolution path the workbench renders (won, shadowed, split, override,
// unattributed clusters). Mirrors the shape of the real 80-resource demo
// estate (`@workspec/cost-engine`'s `test/fixtures/demo-estate/`) without
// its size. Used only by this package's own tests — not exported from
// `index.ts`.

import { API_VERSION, compareResourceIds, compareSpendRows } from '@workspec/cost-schema';
import type {
  Attribution,
  CostRepositoryPort,
  Inventory,
  InventoryResourceType,
  Ref,
  Spend,
  SpendRowType,
  TagPlan,
  TagPlanEntryType,
} from '@workspec/cost-schema';
import { createMemoryRepository } from '@workspec/cost-schema';

export const TEST_SUBSCRIPTION = '00000000-0000-0000-0000-00000000test';
export const TEST_LOCATION = 'testlocation';
export const TEST_INVENTORY_AS_OF = '2026-01-01T00:00:00Z';
export const TEST_PERIOD = '2026-01';
export const TEST_CURRENCY = 'USD';

interface RawResource {
  name: string;
  type: string;
  resourceGroup: string;
  tags?: Record<string, string>;
  spend: number;
}

// Already ascending by name/id — the sort-order contract the schema enforces.
export const RAW_RESOURCES: readonly RawResource[] = [
  { name: 'res-a1', type: 'App Service', resourceGroup: 'rg-a', spend: 100 },
  { name: 'res-a2', type: 'Storage', resourceGroup: 'rg-a', spend: 50 },
  { name: 'res-client1', type: 'App Service', resourceGroup: 'rg-c', tags: { client: 'acme' }, spend: 200 },
  { name: 'res-client2', type: 'Storage', resourceGroup: 'rg-c', tags: { client: 'acme' }, spend: 80 },
  { name: 'res-legacy1', type: 'VM', resourceGroup: 'rg-legacy', spend: 60 },
  { name: 'res-legacy2', type: 'VM', resourceGroup: 'rg-legacy', spend: 40 },
  { name: 'res-override', type: 'VM', resourceGroup: 'rg-legacy', spend: 20 },
  { name: 'res-shared', type: 'AKS cluster', resourceGroup: 'rg-shared', spend: 300 },
];

export const TEST_OVERRIDE_RESOURCE = 'res-override';
export const TEST_TOTAL_SPEND = RAW_RESOURCES.reduce((sum, r) => sum + r.spend, 0); // 850
// Unattributed (on product): res-client1 ($200) + res-client2 ($80) + res-legacy1 ($60) + res-legacy2 ($40) = $380.
export const TEST_UNATTRIBUTED_SPEND = 380;
export const TEST_UNATTRIBUTED_COUNT = 4;

export function buildTestInventory(): Inventory {
  const resources: InventoryResourceType[] = RAW_RESOURCES.map((r) => ({
    id: r.name,
    name: r.name,
    type: r.type,
    location: TEST_LOCATION,
    resourceGroup: r.resourceGroup,
    subscription: TEST_SUBSCRIPTION,
    ...(r.tags !== undefined ? { tags: r.tags } : {}),
  })).sort((a, b) => compareResourceIds(a.id, b.id));

  return {
    apiVersion: API_VERSION,
    kind: 'Inventory',
    metadata: { id: 'test-estate' },
    spec: {
      asOf: TEST_INVENTORY_AS_OF,
      scope: { subscriptions: [TEST_SUBSCRIPTION] },
      resources,
    },
  };
}

export function buildTestSpend(): Spend {
  const rows: SpendRowType[] = RAW_RESOURCES.map((r) => ({
    resourceId: r.name,
    amount: r.spend,
    currency: TEST_CURRENCY,
    period: TEST_PERIOD,
    serviceCategory: r.type,
  })).sort(compareSpendRows);

  return {
    apiVersion: API_VERSION,
    kind: 'Spend',
    metadata: { id: 'test-estate-2026-01' },
    spec: { rows },
  };
}

export function buildTestAttribution(): Attribution {
  return {
    apiVersion: API_VERSION,
    kind: 'Attribution',
    metadata: { id: 'test-estate' },
    spec: {
      dimensions: [
        { id: 'product', label: 'Product', values: ['workspec', 'atrium', 'shared'] },
        { id: 'costType', label: 'Cost type', values: ['capex', 'opex'] },
        { id: 'client', label: 'Client', values: ['acme', 'internal'] },
      ],
      rules: [
        {
          id: 'r1',
          name: 'A resource groups',
          match: { resourceGroup: 'rg-a' },
          assign: { product: 'workspec' },
        },
        {
          id: 'r2',
          name: 'Shared AKS split',
          match: { nameGlob: 'res-shared' },
          split: { product: { workspec: 0.6, atrium: 0.4 } },
        },
        {
          id: 'r3',
          name: 'Client from tag',
          match: { tagExists: 'client' },
          fromTag: { client: 'client' },
        },
        {
          id: 'r4',
          name: 'Default: opex, internal',
          match: {},
          assign: { costType: 'opex', client: 'internal' },
        },
      ],
      overrides: [{ resourceId: TEST_OVERRIDE_RESOURCE, assign: { product: 'shared' } }],
    },
  };
}

/**
 * A tag plan over the test estate with one of each non-noop action plus a
 * noop, so op-ordering (remove → change → add, noops hidden) is exercised.
 * `baselineAsOf` is a parameter so tests can pass `TEST_INVENTORY_AS_OF`
 * (no drift) or anything else (drift pill on).
 */
export function buildTestTagPlan(baselineAsOf: string): TagPlan {
  return {
    apiVersion: API_VERSION,
    kind: 'TagPlan',
    metadata: { id: 'test-estate-2026-01' },
    spec: {
      baselineAsOf,
      tagMapping: { product: 'fs-product', costType: 'fs-cost-type', client: 'fs-client' },
      entries: (
        [
          { resourceId: 'res-a1', tag: 'fs-product', current: null, desired: 'workspec', action: 'add' },
          {
            resourceId: 'res-client1',
            tag: 'fs-client',
            current: 'acme',
            desired: 'acme',
            action: 'noop',
          },
          { resourceId: 'res-legacy1', tag: 'fs-product', current: 'oldval', desired: null, action: 'remove' },
          {
            resourceId: 'res-shared',
            tag: 'fs-product',
            current: 'workspec',
            desired: 'workspec:60|atrium:40',
            action: 'change',
          },
        ] satisfies TagPlanEntryType[]
      ).sort((a, b) => (a.resourceId === b.resourceId ? a.tag.localeCompare(b.tag) : a.resourceId.localeCompare(b.resourceId))),
    },
  };
}

export interface TestRepository {
  repository: CostRepositoryPort;
  inventoryRef: Ref;
  attributionRef: Ref;
  spendRef: Ref;
  tagPlanRef: Ref;
}

/** Build a `createMemoryRepository` seeded with the compact test estate. */
export function createTestRepository(options: { tagPlanBaselineAsOf?: string } = {}): TestRepository {
  const inventoryRef = 'test.inventory.yaml';
  const attributionRef = 'test.attribution.yaml';
  const spendRef = 'test.spend.yaml';
  const tagPlanRef = 'plans/2026-01.tagplan.yaml';
  const repository = createMemoryRepository({
    inventories: { [inventoryRef]: buildTestInventory() },
    attributions: { [attributionRef]: buildTestAttribution() },
    spends: { [spendRef]: buildTestSpend() },
    tagPlans: { [tagPlanRef]: buildTestTagPlan(options.tagPlanBaselineAsOf ?? TEST_INVENTORY_AS_OF) },
  });
  return { repository, inventoryRef, attributionRef, spendRef, tagPlanRef };
}
