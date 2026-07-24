import { describe, expect, it } from 'vitest';
import { resolveTerraformCatalogKey } from './terraform-type-map.js';

describe('resolveTerraformCatalogKey', () => {
  it('resolves every representative azurerm_* type', () => {
    expect(resolveTerraformCatalogKey('azurerm_linux_web_app')).toBe('appService');
    expect(resolveTerraformCatalogKey('azurerm_windows_web_app')).toBe('appService');
    expect(resolveTerraformCatalogKey('azurerm_app_service')).toBe('appService');
    expect(resolveTerraformCatalogKey('azurerm_linux_function_app')).toBe('functionApp');
    expect(resolveTerraformCatalogKey('azurerm_function_app')).toBe('functionApp');
    expect(resolveTerraformCatalogKey('azurerm_mssql_database')).toBe('sqlDatabase');
    expect(resolveTerraformCatalogKey('azurerm_sql_database')).toBe('sqlDatabase');
    expect(resolveTerraformCatalogKey('azurerm_redis_cache')).toBe('redisCache');
    expect(resolveTerraformCatalogKey('azurerm_redis_enterprise_cluster')).toBe('redisEnterprise');
    expect(resolveTerraformCatalogKey('azurerm_private_endpoint')).toBe('privateEndpoint');
    expect(resolveTerraformCatalogKey('azurerm_virtual_network')).toBe('virtualNetwork');
    expect(resolveTerraformCatalogKey('azurerm_subnet')).toBe('subnet');
    expect(resolveTerraformCatalogKey('azurerm_resource_group')).toBe('resourceGroup');
    expect(resolveTerraformCatalogKey('azurerm_frontdoor')).toBe('frontDoor');
    expect(resolveTerraformCatalogKey('azurerm_cdn_frontdoor_profile')).toBe('frontDoor');
    expect(resolveTerraformCatalogKey('azurerm_application_insights')).toBe('appInsights');
    expect(resolveTerraformCatalogKey('azurerm_log_analytics_workspace')).toBe('logAnalytics');
    expect(resolveTerraformCatalogKey('azurerm_user_assigned_identity')).toBe('identity');
    expect(resolveTerraformCatalogKey('azurerm_search_service')).toBe('search');
    expect(resolveTerraformCatalogKey('azurerm_storage_account')).toBe('storage');
    expect(resolveTerraformCatalogKey('azurerm_recovery_services_vault')).toBe('vault');
  });

  it('folds any azurerm_monitor_* type into the generic monitor mapping', () => {
    expect(resolveTerraformCatalogKey('azurerm_monitor_action_group')).toBe('monitorGeneric');
    expect(resolveTerraformCatalogKey('azurerm_monitor_diagnostic_setting')).toBe('monitorGeneric');
  });

  it('returns undefined for a type with no mapping', () => {
    expect(resolveTerraformCatalogKey('azurerm_public_ip')).toBeUndefined();
  });
});
