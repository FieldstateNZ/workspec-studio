// A compact, self-contained cost estate for the smoke host: 8 resources
// across 4 resource groups, 3 attribution dimensions, and 4 rules (one plain
// assign, one split, one fromTag, one catch-all assign) plus one pinned
// override — enough surface to exercise `AttributionWorkbench`'s coverage
// meter + resource cascade and `CostReport`'s rollups, without needing real
// billing fixtures. Also seeds a small, schema-valid TagPlan (a handful of
// entries covering add/change/remove/noop) so `TagPlanView` has something to
// render. Deliberately NOT sourced from @workspec/cost-ui's own
// internal test estate (src/test-helpers/cost-estate.ts) — that helper isn't
// exported by the package, so a host has no way to import it; this is a
// fresh, host-owned seed built directly from the public `@workspec/cost-schema`
// artifact shapes, the same way a real enterprise host would author one.
import {
  API_VERSION,
  compareResourceIds,
  compareSpendRows,
  createMemoryRepository,
} from '@workspec/cost-schema';
import type {
  Attribution,
  CostRepositoryPort,
  Inventory,
  InventoryResourceType,
  Ref,
  Spend,
  SpendRowType,
  TagPlan,
} from '@workspec/cost-schema';

const SUBSCRIPTION = '00000000-0000-0000-0000-0000000mfh01';
const LOCATION = 'australiaeast';
const INVENTORY_AS_OF = '2026-07-01T00:00:00Z';
const PERIOD = '2026-06';
const CURRENCY = 'NZD';

interface SeedResource {
  name: string;
  type: string;
  resourceGroup: string;
  tags?: Record<string, string>;
  spend: number;
}

// Already ascending by name/id — the sort-order contract InventoryArtifact enforces.
const RESOURCES: readonly SeedResource[] = [
  { name: 'res-app1', type: 'App Service', resourceGroup: 'rg-app', spend: 120 },
  { name: 'res-app2', type: 'App Service', resourceGroup: 'rg-app', spend: 90 },
  { name: 'res-client1', type: 'App Service', resourceGroup: 'rg-client', tags: { client: 'acme' }, spend: 180 },
  { name: 'res-client2', type: 'Storage', resourceGroup: 'rg-client', tags: { client: 'acme' }, spend: 60 },
  { name: 'res-db1', type: 'SQL Database', resourceGroup: 'rg-data', spend: 240 },
  { name: 'res-legacy1', type: 'VM', resourceGroup: 'rg-legacy', spend: 75 },
  { name: 'res-shared1', type: 'AKS cluster', resourceGroup: 'rg-shared', spend: 300 },
  { name: 'res-store1', type: 'Storage', resourceGroup: 'rg-data', spend: 45 },
];

/** The resource the pinned override targets. */
export const COST_OVERRIDE_RESOURCE_ID = 'res-legacy1';

export const COST_INVENTORY_REF: Ref = 'mf-host.inventory.yaml';
export const COST_ATTRIBUTION_REF: Ref = 'mf-host.attribution.yaml';
export const COST_SPEND_REF: Ref = 'mf-host.spend.yaml';
export const COST_TAGPLAN_REF: Ref = 'mf-host.tagplan.yaml';

function buildInventory(): Inventory {
  const resources: InventoryResourceType[] = RESOURCES.map((r) => ({
    id: r.name,
    name: r.name,
    type: r.type,
    location: LOCATION,
    resourceGroup: r.resourceGroup,
    subscription: SUBSCRIPTION,
    ...(r.tags !== undefined ? { tags: r.tags } : {}),
  })).sort((a, b) => compareResourceIds(a.id, b.id));

  return {
    apiVersion: API_VERSION,
    kind: 'Inventory',
    metadata: { id: 'mf-host-estate', name: 'MF host smoke estate' },
    spec: {
      asOf: INVENTORY_AS_OF,
      scope: { subscriptions: [SUBSCRIPTION] },
      resources,
    },
  };
}

function buildSpend(): Spend {
  const rows: SpendRowType[] = RESOURCES.map((r) => ({
    resourceId: r.name,
    amount: r.spend,
    currency: CURRENCY,
    period: PERIOD,
    serviceCategory: r.type,
  })).sort(compareSpendRows);

  return {
    apiVersion: API_VERSION,
    kind: 'Spend',
    metadata: { id: 'mf-host-estate-2026-06' },
    spec: { rows },
  };
}

function buildAttribution(): Attribution {
  return {
    apiVersion: API_VERSION,
    kind: 'Attribution',
    metadata: { id: 'mf-host-estate' },
    spec: {
      dimensions: [
        { id: 'product', label: 'Product', values: ['ledger', 'atlas', 'shared'] },
        { id: 'costType', label: 'Cost type', values: ['capex', 'opex'] },
        { id: 'client', label: 'Client', values: ['acme', 'internal'] },
      ],
      rules: [
        {
          id: 'r1',
          name: 'App resource group',
          match: { resourceGroup: 'rg-app' },
          assign: { product: 'ledger' },
        },
        {
          id: 'r2',
          name: 'Shared AKS split',
          match: { nameGlob: 'res-shared*' },
          split: { product: { ledger: 0.5, atlas: 0.5 } },
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
      // Pinned override: res-legacy1 would otherwise be unattributed on
      // `product` (no rule matches rg-legacy) — the override beats all
      // rules and pins it to `shared`.
      overrides: [{ resourceId: COST_OVERRIDE_RESOURCE_ID, assign: { product: 'shared' } }],
    },
  };
}

// A small, schema-valid TagPlan consistent with the estate above: one entry
// per resource × tag (resourceIds are already strictly ascending, so the
// (resourceId, tag) sort contract holds trivially), action consistent with
// current/desired (add ⇒ current null, remove ⇒ desired null, change ⇒ both
// set and differ, noop ⇒ equal), and a non-empty `tagMapping` naming a
// physical tag per attribution dimension. `baselineAsOf` matches the seed
// inventory's `asOf`, so the view's drift pill stays quiet.
function buildTagPlan(): TagPlan {
  return {
    apiVersion: API_VERSION,
    kind: 'TagPlan',
    metadata: { id: 'mf-host-estate-plan', name: 'MF host smoke tag plan' },
    spec: {
      baselineAsOf: INVENTORY_AS_OF,
      tagMapping: { product: 'ws-product', costType: 'ws-cost-type', client: 'ws-client' },
      entries: [
        { resourceId: 'res-app1', tag: 'ws-product', current: null, desired: 'ledger', action: 'add' },
        {
          resourceId: 'res-app2',
          tag: 'ws-product',
          current: 'atlas',
          desired: 'ledger',
          action: 'change',
        },
        {
          resourceId: 'res-client1',
          tag: 'ws-client',
          current: 'acme',
          desired: 'acme',
          action: 'noop',
        },
        {
          resourceId: 'res-client2',
          tag: 'ws-client',
          current: null,
          desired: 'acme',
          action: 'add',
        },
        {
          resourceId: 'res-legacy1',
          tag: 'ws-product',
          current: 'legacy',
          desired: null,
          action: 'remove',
        },
        {
          // Split-serialized desired value (the engine's own convention for a
          // split rule's output) — the schema explicitly allows `:` and `|`.
          resourceId: 'res-shared1',
          tag: 'ws-product',
          current: null,
          desired: 'ledger:50|atlas:50',
          action: 'add',
        },
      ],
    },
  };
}

/** Build a fresh `createMemoryRepository`, seeded with the compact estate above. */
export function createCostSeedRepository(): CostRepositoryPort {
  return createMemoryRepository({
    inventories: { [COST_INVENTORY_REF]: buildInventory() },
    attributions: { [COST_ATTRIBUTION_REF]: buildAttribution() },
    spends: { [COST_SPEND_REF]: buildSpend() },
    tagPlans: { [COST_TAGPLAN_REF]: buildTagPlan() },
  });
}
