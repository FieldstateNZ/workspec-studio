import type { ResourceKindType as ResourceKind } from '@workspec/topology-schema';

/**
 * The `{kind, type}` pair a resource-shaped vendor entity maps onto:
 * `kind` is the closed topology `ResourceKind` a renderer switches on;
 * `type` is the vendor-specific display string that lands in
 * `ResourceSpec.type` (e.g. "Azure App Service").
 */
export interface VendorKindMapping {
  readonly kind: ResourceKind;
  readonly type: string;
}

/**
 * The single canonical vendor→kind mapping table, reused by all three
 * adapters. Each entry is keyed by a vendor-neutral catalog key (`appService`,
 * `sqlDatabase`, …) rather than by a Terraform or ARM type string directly,
 * so the same `{kind, type}` pair is defined exactly once and each adapter
 * only needs a small type-string → catalog-key lookup of its own (see
 * `terraform/terraform-type-map.ts` and `arm-type-map.ts`, the latter shared
 * by the bicep and azure-resource-graph adapters). This is the mapping the
 * build brief asks to be "reused across adapters".
 *
 * `type` strings are load-bearing for reconciliation, not just display text:
 * recon's fallback match (when `source.from` doesn't line up) is the tuple
 * `(kind, type, resourceGroup, name)`, so a derived resource's `type` must be
 * byte-for-byte identical to what a human would author by hand for the same
 * resource — otherwise a correctly-imported resource looks like a phantom
 * (derived) plus an orphan (authored) instead of one matched resource. Every
 * entry below is either copied verbatim from an authored fixture in
 * `packages/topology-schema/test/fixtures/valid/*.resource.yaml` (see
 * `vendor-kind-catalog.consumer-contract.test.ts`, which cross-checks this
 * against those fixtures so drift fails loudly) or, where no such fixture
 * exists yet, follows the same `'Azure <Product>'` convention those fixtures
 * establish — `Private Endpoint` is the one authored exception to that
 * convention, so it's left unprefixed to match.
 */
export const VENDOR_KIND_CATALOG = {
  appService: { kind: 'compute', type: 'Azure App Service' },
  functionApp: { kind: 'function', type: 'Azure Functions' },
  sqlDatabase: { kind: 'database', type: 'Azure SQL Database' },
  redisCache: { kind: 'cache', type: 'Azure Cache for Redis' },
  redisEnterprise: { kind: 'cache', type: 'Azure Managed Redis' },
  privateEndpoint: { kind: 'endpoint', type: 'Private Endpoint' },
  virtualNetwork: { kind: 'vnet', type: 'Azure Virtual Network' },
  subnet: { kind: 'subnet', type: 'Azure Subnet' },
  resourceGroup: { kind: 'resource-group', type: 'Azure Resource Group' },
  frontDoor: { kind: 'edge', type: 'Azure Front Door' },
  appInsights: { kind: 'monitor', type: 'Azure Application Insights' },
  logAnalytics: { kind: 'monitor', type: 'Azure Log Analytics Workspace' },
  monitorGeneric: { kind: 'monitor', type: 'Azure Monitor' },
  identity: { kind: 'identity', type: 'Azure User Assigned Identity' },
  search: { kind: 'search', type: 'Azure AI Search' },
  storage: { kind: 'storage', type: 'Azure Storage Account' },
  vault: { kind: 'vault', type: 'Azure Recovery Services Vault' },
} as const satisfies Record<string, VendorKindMapping>;

/** One of the canonical catalog keys `VENDOR_KIND_CATALOG` defines. */
export type VendorKindKey = keyof typeof VENDOR_KIND_CATALOG;
