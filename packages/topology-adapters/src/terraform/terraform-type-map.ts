import type { VendorKindKey } from '../vendor-kind-catalog.js';

/**
 * Terraform `azurerm_*` resource types → canonical catalog key. Terraform's
 * type strings already disambiguate App Service vs. Function App (unlike
 * ARM's shared `Microsoft.Web/sites`), so — unlike `arm-type-map.ts` — this
 * table needs no runtime disambiguation step.
 */
const AZURERM_TYPE_TO_CATALOG_KEY: Readonly<Record<string, VendorKindKey>> = {
  azurerm_linux_web_app: 'appService',
  azurerm_windows_web_app: 'appService',
  azurerm_app_service: 'appService',
  azurerm_linux_function_app: 'functionApp',
  azurerm_function_app: 'functionApp',
  azurerm_mssql_database: 'sqlDatabase',
  azurerm_sql_database: 'sqlDatabase',
  azurerm_redis_cache: 'redisCache',
  azurerm_redis_enterprise_cluster: 'redisEnterprise',
  azurerm_private_endpoint: 'privateEndpoint',
  azurerm_virtual_network: 'virtualNetwork',
  azurerm_subnet: 'subnet',
  azurerm_resource_group: 'resourceGroup',
  azurerm_frontdoor: 'frontDoor',
  azurerm_cdn_frontdoor_profile: 'frontDoor',
  azurerm_application_insights: 'appInsights',
  azurerm_log_analytics_workspace: 'logAnalytics',
  azurerm_user_assigned_identity: 'identity',
  azurerm_search_service: 'search',
  azurerm_storage_account: 'storage',
  azurerm_recovery_services_vault: 'vault',
};

const MONITOR_TYPE_PREFIX = 'azurerm_monitor_';

/**
 * Resolves a Terraform resource `type` (e.g. `"azurerm_linux_web_app"`) to a
 * canonical catalog key, or `undefined` if the vendor type has no mapping.
 */
export function resolveTerraformCatalogKey(type: string): VendorKindKey | undefined {
  const direct = AZURERM_TYPE_TO_CATALOG_KEY[type];
  if (direct) return direct;

  // `azurerm_monitor_*` spans many resource types (action groups, alert
  // rules, diagnostic settings, …) — fold all of them into the generic
  // monitor mapping rather than growing the static table per sub-type.
  if (type.startsWith(MONITOR_TYPE_PREFIX)) return 'monitorGeneric';

  return undefined;
}
