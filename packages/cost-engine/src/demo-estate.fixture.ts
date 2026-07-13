// The "fieldstate-azure" demo estate: 80 resources, 8 rules, 1 override,
// transcribed verbatim from the Claude Design handoff prototypes
// (`Attribution Workbench.dc.html` / `WorkSpec Studio.dc.html`, Studio
// superset tag data). This module is the SINGLE source of truth for that
// data — `scripts/gen-demo-fixtures.ts` (one-time authoring) and
// `src/golden.test.ts` (the CI-enforced drift proof) both build the
// committed `test/fixtures/demo-estate/*.yaml` from these same functions, so
// the fixtures can never silently diverge from this file.
//
// Excluded from the published build (see tsconfig.build.json) — this is
// fixture-authoring data, not engine surface.
//
// Fields the prototypes don't carry (`location`, ISO `currency`, per-resource
// `id`, `subscription`) are synthesized here; see
// `test/fixtures/demo-estate/README.md` for the documented synthesis rules.

import { API_VERSION, compareResourceIds, compareSpendRows } from '@workspec/cost-schema';
import type {
  Attribution,
  DimensionType,
  Inventory,
  InventoryResourceType,
  RuleType,
  Spend,
  SpendRowType,
} from '@workspec/cost-schema';
import type { TagMapping } from './types.js';

// ── Fixed identity fields (synthesis rules — see fixture README) ───────────

export const SUBSCRIPTION_ID = '00000000-0000-0000-0000-000000000001';
export const LOCATION = 'australiaeast';
export const INVENTORY_AS_OF = '2026-07-07T00:00:00Z';
export const SPEND_PERIOD = '2026-07';
export const SPEND_CURRENCY = 'USD';

export const INVENTORY_METADATA_ID = 'fieldstate-azure';
export const SPEND_METADATA_ID = 'fieldstate-azure-2026-07';
export const ATTRIBUTION_METADATA_ID = 'fieldstate-azure';

/** Dimension id → tag name mapping used by the Plan review demo. */
export const TAG_MAPPING: TagMapping = {
  product: 'fs-product',
  costType: 'fs-cost-type',
  client: 'fs-client',
};

// ── Resource type → ARM-style provider path (defined once, deterministic) ──
// Not a claim of Azure-accurate resource-type strings throughout (e.g.
// Functions is split from App Service for readability) — just a stable,
// documented 1:1 mapping used to synthesize resource ids.

export const TYPE_PROVIDER_PATH: Readonly<Record<string, string>> = {
  'App Service': 'microsoft.web/sites',
  PostgreSQL: 'microsoft.dbforpostgresql/flexibleservers',
  Storage: 'microsoft.storage/storageaccounts',
  'Key Vault': 'microsoft.keyvault/vaults',
  'App Insights': 'microsoft.insights/components',
  'Load balancer': 'microsoft.network/loadbalancers',
  'Container App': 'microsoft.app/containerapps',
  'Log Analytics': 'microsoft.operationalinsights/workspaces',
  Redis: 'microsoft.cache/redis',
  Functions: 'microsoft.web/functions',
  'AKS cluster': 'microsoft.containerservice/managedclusters',
  Registry: 'microsoft.containerregistry/registries',
  'VPN gateway': 'microsoft.network/vpngateways',
  'DNS zone': 'microsoft.network/dnszones',
  Firewall: 'microsoft.network/azurefirewalls',
  Bastion: 'microsoft.network/bastionhosts',
  CDN: 'microsoft.cdn/profiles',
  'AI Search': 'microsoft.search/searchservices',
  VM: 'microsoft.compute/virtualmachines',
  'SQL DB': 'microsoft.sql/servers',
};

/** Synthesize the lowercase ARM-style resource id for a demo-estate resource. */
export function resourceId(name: string, type: string, resourceGroup: string): string {
  const providerPath = TYPE_PROVIDER_PATH[type];
  if (providerPath === undefined) {
    throw new Error(`demo-estate fixture: no providerPath mapping for type "${type}"`);
  }
  return `/subscriptions/${SUBSCRIPTION_ID}/resourcegroups/${resourceGroup}/providers/${providerPath}/${name}`;
}

// ── Raw resources (verbatim from demo-estate.json's `resources[]`) ─────────

export interface RawResource {
  name: string;
  type: string;
  resourceGroup: string;
  tags: Record<string, string> | null;
  spendPerMonth: number;
}

export const RAW_RESOURCES: readonly RawResource[] = [
  { name: 'workspec-api-prod', type: 'App Service', resourceGroup: 'rg-workspec-prod', tags: { 'fs-product': 'workspec' }, spendPerMonth: 410 },
  { name: 'workspec-web-prod', type: 'App Service', resourceGroup: 'rg-workspec-prod', tags: null, spendPerMonth: 180 },
  { name: 'workspec-pg-prod', type: 'PostgreSQL', resourceGroup: 'rg-workspec-prod', tags: null, spendPerMonth: 620 },
  { name: 'workspecprodstore', type: 'Storage', resourceGroup: 'rg-workspec-prod', tags: null, spendPerMonth: 95 },
  { name: 'workspecassets', type: 'Storage', resourceGroup: 'rg-workspec-prod', tags: null, spendPerMonth: 60 },
  { name: 'workspec-kv-prod', type: 'Key Vault', resourceGroup: 'rg-workspec-prod', tags: null, spendPerMonth: 8 },
  { name: 'workspec-ai-prod', type: 'App Insights', resourceGroup: 'rg-workspec-prod', tags: null, spendPerMonth: 140 },
  { name: 'workspec-lb-prod', type: 'Load balancer', resourceGroup: 'rg-workspec-prod', tags: null, spendPerMonth: 36 },
  { name: 'workspec-jobs-prod', type: 'Container App', resourceGroup: 'rg-workspec-prod', tags: null, spendPerMonth: 210 },
  { name: 'workspec-logs', type: 'Log Analytics', resourceGroup: 'rg-workspec-prod', tags: { 'fs-product': 'platform' }, spendPerMonth: 310 },
  { name: 'workspec-redis-prod', type: 'Redis', resourceGroup: 'rg-workspec-prod', tags: null, spendPerMonth: 190 },
  { name: 'workspec-func-prod', type: 'Functions', resourceGroup: 'rg-workspec-prod', tags: null, spendPerMonth: 45 },
  { name: 'workspec-api-dev', type: 'App Service', resourceGroup: 'rg-workspec-dev', tags: null, spendPerMonth: 85 },
  { name: 'workspec-web-dev', type: 'App Service', resourceGroup: 'rg-workspec-dev', tags: null, spendPerMonth: 40 },
  { name: 'workspec-pg-dev', type: 'PostgreSQL', resourceGroup: 'rg-workspec-dev', tags: null, spendPerMonth: 98 },
  { name: 'workspecdevstore', type: 'Storage', resourceGroup: 'rg-workspec-dev', tags: null, spendPerMonth: 22 },
  { name: 'workspec-kv-dev', type: 'Key Vault', resourceGroup: 'rg-workspec-dev', tags: null, spendPerMonth: 3 },
  { name: 'workspec-ai-dev', type: 'App Insights', resourceGroup: 'rg-workspec-dev', tags: null, spendPerMonth: 30 },
  { name: 'workspec-jobs-dev', type: 'Container App', resourceGroup: 'rg-workspec-dev', tags: null, spendPerMonth: 35 },
  { name: 'workspec-func-dev', type: 'Functions', resourceGroup: 'rg-workspec-dev', tags: null, spendPerMonth: 12 },
  { name: 'workspec-preview', type: 'Container App', resourceGroup: 'rg-workspec-dev', tags: null, spendPerMonth: 28 },
  { name: 'atrium-api-prod', type: 'App Service', resourceGroup: 'rg-atrium-prod', tags: null, spendPerMonth: 380 },
  { name: 'atrium-web-prod', type: 'App Service', resourceGroup: 'rg-atrium-prod', tags: null, spendPerMonth: 165 },
  { name: 'atrium-pg-prod', type: 'PostgreSQL', resourceGroup: 'rg-atrium-prod', tags: null, spendPerMonth: 540 },
  { name: 'atriumprodstore', type: 'Storage', resourceGroup: 'rg-atrium-prod', tags: null, spendPerMonth: 130 },
  { name: 'atrium-kv-prod', type: 'Key Vault', resourceGroup: 'rg-atrium-prod', tags: null, spendPerMonth: 8 },
  { name: 'atrium-ai-prod', type: 'App Insights', resourceGroup: 'rg-atrium-prod', tags: null, spendPerMonth: 120 },
  { name: 'atrium-cdn-prod', type: 'CDN', resourceGroup: 'rg-atrium-prod', tags: null, spendPerMonth: 75 },
  { name: 'atrium-search-prod', type: 'AI Search', resourceGroup: 'rg-atrium-prod', tags: null, spendPerMonth: 260 },
  { name: 'atrium-logs', type: 'Log Analytics', resourceGroup: 'rg-atrium-prod', tags: null, spendPerMonth: 240 },
  { name: 'atrium-redis-prod', type: 'Redis', resourceGroup: 'rg-atrium-prod', tags: null, spendPerMonth: 160 },
  { name: 'atrium-media', type: 'Storage', resourceGroup: 'rg-atrium-prod', tags: { 'fs-product': 'atrium', 'fs-cost-type': 'opex' }, spendPerMonth: 210 },
  { name: 'atrium-api-dev', type: 'App Service', resourceGroup: 'rg-atrium-dev', tags: null, spendPerMonth: 70 },
  { name: 'atrium-web-dev', type: 'App Service', resourceGroup: 'rg-atrium-dev', tags: null, spendPerMonth: 35 },
  { name: 'atrium-pg-dev', type: 'PostgreSQL', resourceGroup: 'rg-atrium-dev', tags: null, spendPerMonth: 98 },
  { name: 'atriumdevstore', type: 'Storage', resourceGroup: 'rg-atrium-dev', tags: null, spendPerMonth: 18 },
  { name: 'atrium-kv-dev', type: 'Key Vault', resourceGroup: 'rg-atrium-dev', tags: null, spendPerMonth: 3 },
  { name: 'atrium-ai-dev', type: 'App Insights', resourceGroup: 'rg-atrium-dev', tags: null, spendPerMonth: 25 },
  { name: 'atrium-preview', type: 'Container App', resourceGroup: 'rg-atrium-dev', tags: null, spendPerMonth: 30 },
  { name: 'atrium-e2e-runner', type: 'Container App', resourceGroup: 'rg-atrium-dev', tags: null, spendPerMonth: 40 },
  { name: 'coffers-api-prod', type: 'App Service', resourceGroup: 'rg-coffers-prod', tags: null, spendPerMonth: 290 },
  { name: 'coffers-pg-prod', type: 'PostgreSQL', resourceGroup: 'rg-coffers-prod', tags: null, spendPerMonth: 460 },
  { name: 'coffersprodstore', type: 'Storage', resourceGroup: 'rg-coffers-prod', tags: null, spendPerMonth: 85 },
  { name: 'coffers-kv-prod', type: 'Key Vault', resourceGroup: 'rg-coffers-prod', tags: null, spendPerMonth: 8 },
  { name: 'coffers-ai-prod', type: 'App Insights', resourceGroup: 'rg-coffers-prod', tags: null, spendPerMonth: 95 },
  { name: 'coffers-ledger-jobs', type: 'Container App', resourceGroup: 'rg-coffers-prod', tags: null, spendPerMonth: 170 },
  { name: 'coffers-logs', type: 'Log Analytics', resourceGroup: 'rg-coffers-prod', tags: null, spendPerMonth: 180 },
  { name: 'coffers-redis', type: 'Redis', resourceGroup: 'rg-coffers-prod', tags: null, spendPerMonth: 120 },
  { name: 'coffers-export', type: 'Functions', resourceGroup: 'rg-coffers-prod', tags: null, spendPerMonth: 25 },
  { name: 'aks-shared', type: 'AKS cluster', resourceGroup: 'rg-shared-core', tags: null, spendPerMonth: 1840 },
  { name: 'fieldstateacr', type: 'Registry', resourceGroup: 'rg-shared-core', tags: null, spendPerMonth: 160 },
  { name: 'core-logs', type: 'Log Analytics', resourceGroup: 'rg-shared-core', tags: null, spendPerMonth: 420 },
  { name: 'core-kv', type: 'Key Vault', resourceGroup: 'rg-shared-core', tags: null, spendPerMonth: 12 },
  { name: 'core-vpn', type: 'VPN gateway', resourceGroup: 'rg-shared-core', tags: null, spendPerMonth: 140 },
  { name: 'corebackups', type: 'Storage', resourceGroup: 'rg-shared-core', tags: { 'fs-product': 'workspec' }, spendPerMonth: 260 },
  { name: 'core-grafana', type: 'Container App', resourceGroup: 'rg-shared-core', tags: null, spendPerMonth: 90 },
  { name: 'core-dns', type: 'DNS zone', resourceGroup: 'rg-shared-core', tags: null, spendPerMonth: 4 },
  { name: 'core-firewall', type: 'Firewall', resourceGroup: 'rg-shared-core', tags: null, spendPerMonth: 620 },
  { name: 'core-bastion', type: 'Bastion', resourceGroup: 'rg-shared-core', tags: null, spendPerMonth: 138 },
  { name: 'test123storage', type: 'Storage', resourceGroup: 'rg-legacy-misc', tags: { 'fs-product': 'workspec' }, spendPerMonth: 45 },
  { name: 'vm-old-jenkins', type: 'VM', resourceGroup: 'rg-legacy-misc', tags: null, spendPerMonth: 310 },
  { name: 'sqldb-trial', type: 'SQL DB', resourceGroup: 'rg-legacy-misc', tags: null, spendPerMonth: 220 },
  { name: 'legacy-web-01', type: 'App Service', resourceGroup: 'rg-legacy-misc', tags: null, spendPerMonth: 95 },
  { name: 'legacy-web-02', type: 'App Service', resourceGroup: 'rg-legacy-misc', tags: null, spendPerMonth: 95 },
  { name: 'backupvault2019', type: 'Storage', resourceGroup: 'rg-legacy-misc', tags: null, spendPerMonth: 180 },
  { name: 'tempfuncs', type: 'Functions', resourceGroup: 'rg-legacy-misc', tags: null, spendPerMonth: 15 },
  { name: 'demo-pg', type: 'PostgreSQL', resourceGroup: 'rg-legacy-misc', tags: null, spendPerMonth: 98 },
  { name: 'old-cdn-endpoint', type: 'CDN', resourceGroup: 'rg-legacy-misc', tags: null, spendPerMonth: 30 },
  { name: 'scratchstore', type: 'Storage', resourceGroup: 'rg-legacy-misc', tags: null, spendPerMonth: 25 },
  { name: 'vm-dc01', type: 'VM', resourceGroup: 'rg-legacy-misc', tags: null, spendPerMonth: 280 },
  { name: 'legacy-ai', type: 'App Insights', resourceGroup: 'rg-legacy-misc', tags: null, spendPerMonth: 40 },
  { name: 'unnamed-lb', type: 'Load balancer', resourceGroup: 'rg-legacy-misc', tags: null, spendPerMonth: 36 },
  { name: 'acme-portal-prod', type: 'App Service', resourceGroup: 'rg-client-acme', tags: { client: 'acme-dairy' }, spendPerMonth: 240 },
  { name: 'acme-pg', type: 'PostgreSQL', resourceGroup: 'rg-client-acme', tags: { client: 'acme-dairy' }, spendPerMonth: 310 },
  { name: 'acmedocs', type: 'Storage', resourceGroup: 'rg-client-acme', tags: { client: 'acme-dairy' }, spendPerMonth: 55 },
  { name: 'acme-ai', type: 'App Insights', resourceGroup: 'rg-client-acme', tags: { client: 'acme-dairy' }, spendPerMonth: 60 },
  { name: 'acme-jobs', type: 'Container App', resourceGroup: 'rg-client-acme', tags: { client: 'acme-dairy' }, spendPerMonth: 130 },
  { name: 'kauri-portal', type: 'App Service', resourceGroup: 'rg-client-kauri', tags: { client: 'kauri-health' }, spendPerMonth: 190 },
  { name: 'kauri-pg', type: 'PostgreSQL', resourceGroup: 'rg-client-kauri', tags: { client: 'kauri-health' }, spendPerMonth: 260 },
  { name: 'kaurifiles', type: 'Storage', resourceGroup: 'rg-client-kauri', tags: { client: 'kauri-health' }, spendPerMonth: 70 },
];

// ── Dimensions (product first — the primary/coverage dimension) ───────────

export const RAW_DIMENSIONS: readonly DimensionType[] = [
  { id: 'product', label: 'Product', values: ['workspec', 'atrium', 'coffers', 'shared'] },
  { id: 'costType', label: 'Cost type', values: ['capex', 'opex'] },
  { id: 'client', label: 'Client', values: ['acme-dairy', 'kauri-health', 'internal'] },
];

// ── Rules r1–r8 (prototype `m.rg`/`m.name`/`m.tag`/`m.any` → schema fields) ─

export const RAW_RULES: readonly RuleType[] = [
  {
    id: 'r1',
    name: 'Workspec resource groups',
    match: { resourceGroup: 'rg-workspec-*' },
    assign: { product: 'workspec' },
  },
  {
    id: 'r2',
    name: 'Atrium resource groups',
    match: { resourceGroup: 'rg-atrium-*' },
    assign: { product: 'atrium' },
  },
  {
    id: 'r3',
    name: 'Coffers resource groups',
    match: { resourceGroup: 'rg-coffers-*' },
    assign: { product: 'coffers' },
  },
  {
    id: 'r4',
    name: 'Shared AKS split',
    match: { nameGlob: 'aks-shared' },
    split: { product: { workspec: 0.6, atrium: 0.4 } },
  },
  {
    id: 'r5',
    name: 'Shared core platform',
    match: { resourceGroup: 'rg-shared-core' },
    assign: { product: 'shared' },
  },
  {
    id: 'r6',
    name: 'Client from tag',
    match: { tagExists: 'client' },
    fromTag: { client: 'client' },
  },
  {
    id: 'r7',
    name: 'Dev environments capitalise',
    match: { resourceGroup: '*-dev' },
    assign: { costType: 'capex' },
  },
  {
    id: 'r8',
    name: 'Default: opex, internal',
    match: {},
    assign: { costType: 'opex', client: 'internal' },
  },
];

// ── Override (vm-old-jenkins → product: shared, pinned) ────────────────────

export const OVERRIDE_RESOURCE_NAME = 'vm-old-jenkins';
export const OVERRIDE_ASSIGN: Readonly<Record<string, string>> = { product: 'shared' };

function findRawResource(name: string): RawResource {
  const found = RAW_RESOURCES.find((r) => r.name === name);
  if (found === undefined) throw new Error(`demo-estate fixture: no raw resource named "${name}"`);
  return found;
}

// ── Builders (shared by the gen script and the drift-proof test) ──────────

export function buildDemoInventory(): Inventory {
  const resources: InventoryResourceType[] = RAW_RESOURCES.map((r) => ({
    id: resourceId(r.name, r.type, r.resourceGroup),
    name: r.name,
    type: r.type,
    location: LOCATION,
    resourceGroup: r.resourceGroup,
    subscription: SUBSCRIPTION_ID,
    ...(r.tags !== null ? { tags: r.tags } : {}),
  })).sort((a, b) => compareResourceIds(a.id, b.id));

  return {
    apiVersion: API_VERSION,
    kind: 'Inventory',
    metadata: { id: INVENTORY_METADATA_ID },
    spec: {
      asOf: INVENTORY_AS_OF,
      scope: { subscriptions: [SUBSCRIPTION_ID] },
      resources,
    },
  };
}

export function buildDemoSpend(): Spend {
  const rows: SpendRowType[] = RAW_RESOURCES.map((r) => ({
    resourceId: resourceId(r.name, r.type, r.resourceGroup),
    amount: r.spendPerMonth,
    currency: SPEND_CURRENCY,
    period: SPEND_PERIOD,
    serviceCategory: r.type,
  })).sort(compareSpendRows);

  return {
    apiVersion: API_VERSION,
    kind: 'Spend',
    metadata: { id: SPEND_METADATA_ID },
    spec: { rows },
  };
}

export function buildDemoAttribution(): Attribution {
  const overrideResource = findRawResource(OVERRIDE_RESOURCE_NAME);
  return {
    apiVersion: API_VERSION,
    kind: 'Attribution',
    metadata: { id: ATTRIBUTION_METADATA_ID },
    spec: {
      dimensions: [...RAW_DIMENSIONS],
      rules: [...RAW_RULES],
      overrides: [
        {
          resourceId: resourceId(overrideResource.name, overrideResource.type, overrideResource.resourceGroup),
          assign: { ...OVERRIDE_ASSIGN },
        },
      ],
    },
  };
}
