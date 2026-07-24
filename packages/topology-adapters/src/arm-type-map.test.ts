import { describe, expect, it } from 'vitest';
import { isArmWebSitesType, resolveArmCatalogKey } from './arm-type-map.js';

describe('resolveArmCatalogKey', () => {
  it('resolves Microsoft.Web/sites to appService or functionApp by the kind property', () => {
    expect(resolveArmCatalogKey('Microsoft.Web/sites', 'app,linux')).toBe('appService');
    expect(resolveArmCatalogKey('Microsoft.Web/sites', 'functionapp,linux')).toBe('functionApp');
    expect(resolveArmCatalogKey('Microsoft.Web/sites')).toBe('appService');
  });

  it('resolves every other representative ARM type', () => {
    expect(resolveArmCatalogKey('Microsoft.Sql/servers/databases')).toBe('sqlDatabase');
    expect(resolveArmCatalogKey('Microsoft.Cache/redis')).toBe('redisCache');
    expect(resolveArmCatalogKey('Microsoft.Cache/redisEnterprise')).toBe('redisEnterprise');
    expect(resolveArmCatalogKey('Microsoft.Network/privateEndpoints')).toBe('privateEndpoint');
    expect(resolveArmCatalogKey('Microsoft.Network/virtualNetworks')).toBe('virtualNetwork');
    expect(resolveArmCatalogKey('Microsoft.Network/virtualNetworks/subnets')).toBe('subnet');
    expect(resolveArmCatalogKey('Microsoft.Resources/resourceGroups')).toBe('resourceGroup');
    expect(resolveArmCatalogKey('Microsoft.Network/frontDoors')).toBe('frontDoor');
    expect(resolveArmCatalogKey('Microsoft.Cdn/profiles')).toBe('frontDoor');
    expect(resolveArmCatalogKey('Microsoft.Insights/components')).toBe('appInsights');
    expect(resolveArmCatalogKey('Microsoft.OperationalInsights/workspaces')).toBe('logAnalytics');
    expect(resolveArmCatalogKey('Microsoft.ManagedIdentity/userAssignedIdentities')).toBe(
      'identity',
    );
    expect(resolveArmCatalogKey('Microsoft.Search/searchServices')).toBe('search');
    expect(resolveArmCatalogKey('Microsoft.Storage/storageAccounts')).toBe('storage');
    expect(resolveArmCatalogKey('Microsoft.RecoveryServices/vaults')).toBe('vault');
  });

  it('is case-insensitive on the type string', () => {
    expect(resolveArmCatalogKey('MICROSOFT.SQL/SERVERS/DATABASES')).toBe('sqlDatabase');
  });

  it('folds any other Microsoft.Insights/* type into the generic monitor mapping', () => {
    expect(resolveArmCatalogKey('Microsoft.Insights/actionGroups')).toBe('monitorGeneric');
    expect(resolveArmCatalogKey('Microsoft.Insights/diagnosticSettings')).toBe('monitorGeneric');
  });

  it('returns undefined for a type with no mapping', () => {
    expect(resolveArmCatalogKey('Microsoft.Compute/virtualMachines')).toBeUndefined();
  });
});

describe('isArmWebSitesType', () => {
  it('is true for Microsoft.Web/sites, case-insensitively', () => {
    expect(isArmWebSitesType('Microsoft.Web/sites')).toBe(true);
    expect(isArmWebSitesType('microsoft.web/sites')).toBe(true);
  });

  it('is false for every other type', () => {
    expect(isArmWebSitesType('Microsoft.Web/sites/slots')).toBe(false);
    expect(isArmWebSitesType('Microsoft.Sql/servers/databases')).toBe(false);
  });
});
