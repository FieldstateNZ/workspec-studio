import type { VendorKindKey } from './vendor-kind-catalog.js';

/**
 * ARM resource `type` strings (lowercased) → canonical catalog key. Shared
 * by the bicep adapter (compiled ARM template `resources[].type`) and the
 * azure-resource-graph adapter (query result `data[].type`) — both speak the
 * same `Microsoft.<provider>/<type>` type taxonomy, unlike Terraform's `azurerm_*`
 * resource types (see `terraform/terraform-type-map.ts`).
 *
 * `Microsoft.Web/sites` is deliberately absent: it covers both App Service
 * and Function App, distinguished only by the resource's `kind` property
 * (e.g. `"functionapp,linux"` vs `"app,linux"`), so it's resolved by
 * `resolveArmCatalogKey` instead of this static table.
 */
const ARM_TYPE_TO_CATALOG_KEY: Readonly<Record<string, VendorKindKey>> = {
  'microsoft.sql/servers/databases': 'sqlDatabase',
  'microsoft.cache/redis': 'redisCache',
  'microsoft.cache/redisenterprise': 'redisEnterprise',
  'microsoft.network/privateendpoints': 'privateEndpoint',
  'microsoft.network/virtualnetworks': 'virtualNetwork',
  'microsoft.network/virtualnetworks/subnets': 'subnet',
  'microsoft.resources/resourcegroups': 'resourceGroup',
  'microsoft.network/frontdoors': 'frontDoor',
  // Front Door Standard/Premium is provisioned as a `Microsoft.Cdn/profiles`
  // resource — the same ARM type generic Azure CDN profiles use. Treated as
  // Front Door unconditionally here (judgment call, see package README):
  // a plain (non-Front-Door) CDN profile would be mis-mapped, which is
  // acceptable for a representative-fixture adapter but worth flagging to a
  // future maintainer who wires this up against real CDN estates.
  'microsoft.cdn/profiles': 'frontDoor',
  'microsoft.insights/components': 'appInsights',
  'microsoft.operationalinsights/workspaces': 'logAnalytics',
  'microsoft.managedidentity/userassignedidentities': 'identity',
  'microsoft.search/searchservices': 'search',
  'microsoft.storage/storageaccounts': 'storage',
  'microsoft.recoveryservices/vaults': 'vault',
};

const MONITOR_TYPE_PREFIX = 'microsoft.insights/';
const WEB_SITES_TYPE = 'microsoft.web/sites';

/**
 * True when `type` is ARM's shared `Microsoft.Web/sites` type (case-
 * insensitive) — the one type that covers both App Service and Function App,
 * disambiguated only by the resource's `kind` property. Exported so callers
 * (the bicep/ARG mappers) can detect the "no `kind` property at all" case
 * themselves and raise a visibility diagnostic — see
 * `map-bicep-resource.ts`/`map-resource-graph-row.ts`.
 */
export function isArmWebSitesType(type: string): boolean {
  return type.toLowerCase() === WEB_SITES_TYPE;
}

/**
 * Resolves an ARM resource `type` (and, for the ambiguous `Microsoft.Web/sites`
 * case, its `kind` property) to a canonical catalog key, or `undefined` if
 * the vendor type has no mapping. Case-insensitive on `type` — ARM type
 * strings are compared case-insensitively by convention across Azure
 * tooling.
 *
 * When `type` is `Microsoft.Web/sites` and `kindProperty` is absent
 * entirely (not just non-`functionapp`), this silently defaults to
 * `appService` — a stripped/omitted `kind` on a real Function App would be
 * mis-mapped. Callers raise the visibility diagnostic for that case (see
 * `isArmWebSitesType`); this function stays a pure lookup with no
 * diagnostic-shaped return value.
 */
export function resolveArmCatalogKey(
  type: string,
  kindProperty?: string,
): VendorKindKey | undefined {
  if (isArmWebSitesType(type)) {
    return kindProperty?.toLowerCase().includes('functionapp') ? 'functionApp' : 'appService';
  }

  const direct = ARM_TYPE_TO_CATALOG_KEY[type.toLowerCase()];
  if (direct) return direct;

  // `Microsoft.Insights/*` covers several monitor-shaped resource types
  // beyond the two named explicitly above (alert rules, autoscale settings,
  // diagnostic settings, …) — fold all of them into the generic monitor
  // mapping rather than growing the static table per sub-type.
  if (type.toLowerCase().startsWith(MONITOR_TYPE_PREFIX)) return 'monitorGeneric';

  return undefined;
}
