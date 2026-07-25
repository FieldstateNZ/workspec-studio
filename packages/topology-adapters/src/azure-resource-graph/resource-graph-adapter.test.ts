import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ResourceArtifact } from '@workspec/topology-schema';
import { describe, expect, it } from 'vitest';
import { resourceGraphAdapter } from './resource-graph-adapter.js';

const fixturePath = fileURLToPath(
  new URL('../../test/fixtures/resource-graph/sample-result.json', import.meta.url),
);
const sampleResult: unknown = JSON.parse(readFileSync(fixturePath, 'utf-8'));

function bySlug(resources: ReturnType<typeof resourceGraphAdapter>['resources'], slug: string) {
  const resource = resources.find((r) => r.metadata.slug === slug);
  if (!resource) throw new Error(`expected a resource with slug "${slug}"`);
  return resource;
}

describe('resourceGraphAdapter', () => {
  it('maps every representative ARG row to a Resource artifact', () => {
    const { resources } = resourceGraphAdapter(sampleResult);
    expect(resources.map((r) => r.metadata.slug).sort()).toEqual(
      [
        'rg-app',
        'web-app',
        'write-fn',
        'cache',
        'sql-db',
        'core-vnet',
        'snet-workload',
        'redis-pe',
        'stgapp',
        'search-app',
        'id-app',
        'vault-app',
      ].sort(),
    );
  });

  it('every produced resource validates against ResourceArtifact', () => {
    const { resources } = resourceGraphAdapter(sampleResult);
    for (const resource of resources) {
      expect(() => ResourceArtifact.parse(resource)).not.toThrow();
    }
  });

  it('exercises the full vendor→kind catalog across kinds', () => {
    const { resources } = resourceGraphAdapter(sampleResult);
    expect(bySlug(resources, 'rg-app').spec).toMatchObject({
      kind: 'resource-group',
      type: 'Azure Resource Group',
    });
    expect(bySlug(resources, 'web-app').spec).toMatchObject({
      kind: 'compute',
      type: 'Azure App Service',
    });
    expect(bySlug(resources, 'write-fn').spec).toMatchObject({
      kind: 'function',
      type: 'Azure Functions',
    });
    expect(bySlug(resources, 'cache').spec).toMatchObject({
      kind: 'cache',
      type: 'Azure Cache for Redis',
    });
    expect(bySlug(resources, 'sql-db').spec).toMatchObject({
      kind: 'database',
      type: 'Azure SQL Database',
    });
    expect(bySlug(resources, 'core-vnet').spec).toMatchObject({
      kind: 'vnet',
      type: 'Azure Virtual Network',
    });
    expect(bySlug(resources, 'snet-workload').spec).toMatchObject({
      kind: 'subnet',
      type: 'Azure Subnet',
    });
    expect(bySlug(resources, 'redis-pe').spec).toMatchObject({
      kind: 'endpoint',
      type: 'Private Endpoint',
    });
    expect(bySlug(resources, 'stgapp').spec).toMatchObject({
      kind: 'storage',
      type: 'Azure Storage Account',
    });
    expect(bySlug(resources, 'search-app').spec).toMatchObject({
      kind: 'search',
      type: 'Azure AI Search',
    });
    expect(bySlug(resources, 'id-app').spec).toMatchObject({
      kind: 'identity',
      type: 'Azure User Assigned Identity',
    });
    expect(bySlug(resources, 'vault-app').spec).toMatchObject({
      kind: 'vault',
      type: 'Azure Recovery Services Vault',
    });
  });

  it('every produced resource is marked derived with the row id as provenance', () => {
    const { resources } = resourceGraphAdapter(sampleResult);
    const webApp = bySlug(resources, 'web-app');
    expect(webApp.spec.source).toEqual({
      kind: 'derived',
      from: '/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-app/providers/Microsoft.Web/sites/web-app',
    });
  });

  it('resolves resourceGroup from the row column for every resource', () => {
    const { resources } = resourceGraphAdapter(sampleResult);
    for (const resource of resources) {
      expect(resource.spec.resourceGroup).toBe('rg-app');
    }
  });

  it('derives subnet- and private-endpoint-network placement', () => {
    const { resources } = resourceGraphAdapter(sampleResult);
    expect(bySlug(resources, 'snet-workload').spec.network).toBe('core-vnet');
    expect(bySlug(resources, 'redis-pe').spec.network).toBe('snet-workload');
  });

  it('curates config for cache, sql, storage, search, and private endpoint', () => {
    const { resources } = resourceGraphAdapter(sampleResult);
    expect(bySlug(resources, 'cache').spec.config).toEqual({
      skuName: 'Standard',
      family: 'C',
      capacity: 1,
    });
    expect(bySlug(resources, 'sql-db').spec.config).toEqual({ sku: 'GP_Gen5_2' });
    expect(bySlug(resources, 'stgapp').spec.config).toEqual({ sku: 'Standard_LRS' });
    expect(bySlug(resources, 'search-app').spec.config).toEqual({ sku: 'standard' });
  });

  it('emits a diagnostic for an unmapped ARM type and skips it', () => {
    const { resources, diagnostics } = resourceGraphAdapter(sampleResult);
    expect(resources.some((r) => r.metadata.slug === 'unmapped-disk')).toBe(false);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.severity).toBe('warning');
    expect(diagnostics[0]?.source).toContain('unmapped-disk');
  });

  it('returns no resources and no throw for a malformed/empty input', () => {
    expect(resourceGraphAdapter({})).toEqual({ resources: [], diagnostics: [] });
    expect(resourceGraphAdapter(null)).toEqual({ resources: [], diagnostics: [] });
    expect(resourceGraphAdapter({ data: 'not an array' })).toEqual({
      resources: [],
      diagnostics: [],
    });
  });

  it('emits an info diagnostic when a Microsoft.Web/sites row has no `kind` column at all', () => {
    const noKindRow = {
      data: [
        {
          id: '/subscriptions/x/resourceGroups/rg/providers/Microsoft.Web/sites/maybe-a-function',
          name: 'maybe-a-function',
          type: 'microsoft.web/sites',
          resourceGroup: 'rg',
        },
      ],
    };
    const { resources, diagnostics } = resourceGraphAdapter(noKindRow);
    expect(resources).toHaveLength(1);
    expect(resources[0]?.spec.kind).toBe('compute');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ severity: 'info' });
    expect(diagnostics[0]?.message).toContain('defaulted to App Service');
  });

  it('does not emit the defaulted-kind diagnostic for the fixture (every Microsoft.Web/sites row has a `kind`)', () => {
    const { diagnostics } = resourceGraphAdapter(sampleResult);
    expect(diagnostics.some((d) => d.message.includes('defaulted to App Service'))).toBe(false);
  });

  it('disambiguates two rows that produce the same slug in different resource groups instead of dropping one', () => {
    const twoResourceGroupsSharingAName = {
      data: [
        {
          id: '/subscriptions/x/resourceGroups/rg-one/providers/Microsoft.Cache/Redis/cache',
          name: 'cache',
          type: 'microsoft.cache/redis',
          resourceGroup: 'rg-one',
        },
        {
          id: '/subscriptions/x/resourceGroups/rg-two/providers/Microsoft.Cache/Redis/cache',
          name: 'cache',
          type: 'microsoft.cache/redis',
          resourceGroup: 'rg-two',
        },
      ],
    };
    const { resources, diagnostics } = resourceGraphAdapter(twoResourceGroupsSharingAName);
    expect(resources).toHaveLength(2);
    expect(resources.map((r) => r.metadata.slug).sort()).toEqual(['cache-rg-one', 'cache-rg-two']);
    expect(diagnostics.some((d) => d.message.includes('Duplicate slug "cache"'))).toBe(true);
  });
});
