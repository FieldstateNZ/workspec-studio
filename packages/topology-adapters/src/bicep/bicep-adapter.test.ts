import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ResourceArtifact } from '@workspec/topology-schema';
import { describe, expect, it } from 'vitest';
import { bicepAdapter } from './bicep-adapter.js';

const fixturePath = fileURLToPath(
  new URL('../../test/fixtures/bicep/sample-template.json', import.meta.url),
);
const sampleTemplate: unknown = JSON.parse(readFileSync(fixturePath, 'utf-8'));

function bySlug(resources: ReturnType<typeof bicepAdapter>['resources'], slug: string) {
  const resource = resources.find((r) => r.metadata.slug === slug);
  if (!resource) throw new Error(`expected a resource with slug "${slug}"`);
  return resource;
}

describe('bicepAdapter', () => {
  it('maps every representative ARM resource type to a Resource artifact', () => {
    const { resources } = bicepAdapter(sampleTemplate);
    expect(resources.map((r) => r.metadata.slug).sort()).toEqual(
      [
        'core-vnet',
        'snet-workload',
        'web-app',
        'write-fn',
        'cache',
        'sql-db',
        'redis-pe',
        'front-door',
      ].sort(),
    );
  });

  it('every produced resource validates against ResourceArtifact', () => {
    const { resources } = bicepAdapter(sampleTemplate);
    for (const resource of resources) {
      expect(() => ResourceArtifact.parse(resource)).not.toThrow();
    }
  });

  it('disambiguates Microsoft.Web/sites into compute vs. function by `kind`', () => {
    const { resources } = bicepAdapter(sampleTemplate);
    expect(bySlug(resources, 'web-app').spec).toMatchObject({
      kind: 'compute',
      type: 'Azure App Service',
    });
    expect(bySlug(resources, 'write-fn').spec).toMatchObject({
      kind: 'function',
      type: 'Azure Functions',
    });
  });

  it('maps every other representative ARM type to its kind and vendor display type', () => {
    const { resources } = bicepAdapter(sampleTemplate);
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
    expect(bySlug(resources, 'front-door').spec).toMatchObject({
      kind: 'edge',
      type: 'Azure Front Door',
    });
  });

  it('every produced resource is marked derived with an ARM type+name provenance', () => {
    const { resources } = bicepAdapter(sampleTemplate);
    expect(bySlug(resources, 'web-app').spec.source).toEqual({
      kind: 'derived',
      from: 'Microsoft.Web/sites:web-app',
    });
    expect(bySlug(resources, 'snet-workload').spec.source).toEqual({
      kind: 'derived',
      from: 'Microsoft.Network/virtualNetworks/subnets:core-vnet/snet-workload',
    });
  });

  it('derives subnet-network placement from the parent-qualified name', () => {
    const { resources } = bicepAdapter(sampleTemplate);
    expect(bySlug(resources, 'snet-workload').spec.network).toBe('core-vnet');
  });

  it('derives private-endpoint network placement from properties.subnet.id', () => {
    const { resources } = bicepAdapter(sampleTemplate);
    expect(bySlug(resources, 'redis-pe').spec.network).toBe('snet-workload');
  });

  it('does not set resourceGroup — an ARM template carries no deployment scope', () => {
    const { resources } = bicepAdapter(sampleTemplate);
    expect(bySlug(resources, 'web-app').spec.resourceGroup).toBeUndefined();
  });

  it('curates config for vnet, subnet, cache, sql, and private endpoint', () => {
    const { resources } = bicepAdapter(sampleTemplate);
    expect(bySlug(resources, 'core-vnet').spec.config).toEqual({ addressSpace: ['10.0.0.0/16'] });
    expect(bySlug(resources, 'snet-workload').spec.config).toEqual({ prefix: '10.0.1.0/24' });
    expect(bySlug(resources, 'cache').spec.config).toEqual({
      skuName: 'Standard',
      family: 'C',
      capacity: 1,
    });
    expect(bySlug(resources, 'sql-db').spec.config).toEqual({ sku: 'GP_Gen5_2' });
    expect(bySlug(resources, 'redis-pe').spec.config).toEqual({
      targets: [
        {
          name: 'redis-connection',
          resourceId:
            '/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-app/providers/Microsoft.Cache/Redis/cache',
          subresourceNames: ['redisCache'],
        },
      ],
    });
  });

  it('emits a diagnostic for an unmapped ARM type and skips it', () => {
    const { resources, diagnostics } = bicepAdapter(sampleTemplate);
    expect(resources.some((r) => r.metadata.slug === 'unmapped-vm')).toBe(false);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      severity: 'warning',
      source: 'Microsoft.Compute/virtualMachines:unmapped-vm',
    });
  });

  it('returns no resources and no throw for a malformed/empty input', () => {
    expect(bicepAdapter({})).toEqual({ resources: [], diagnostics: [] });
    expect(bicepAdapter(null)).toEqual({ resources: [], diagnostics: [] });
    expect(bicepAdapter({ resources: 'not an array' })).toEqual({ resources: [], diagnostics: [] });
  });

  it('emits an info diagnostic when a Microsoft.Web/sites resource has no `kind` at all (silently defaulted to App Service)', () => {
    const noKindWebSite = {
      resources: [{ type: 'Microsoft.Web/sites', name: 'maybe-a-function', properties: {} }],
    };
    const { resources, diagnostics } = bicepAdapter(noKindWebSite);
    expect(resources).toHaveLength(1);
    expect(resources[0]?.spec.kind).toBe('compute');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      severity: 'info',
      source: 'Microsoft.Web/sites:maybe-a-function',
    });
    expect(diagnostics[0]?.message).toContain('defaulted to App Service');
  });

  it('does not emit the defaulted-kind diagnostic when `kind` is present (even non-function)', () => {
    const { diagnostics } = bicepAdapter(sampleTemplate);
    expect(diagnostics.some((d) => d.message.includes('defaulted to App Service'))).toBe(false);
  });

  it('disambiguates two ARM resources that produce the same slug instead of dropping one', () => {
    const collidingCaches = {
      resources: [
        { type: 'Microsoft.Cache/redis', name: 'cache', properties: {} },
        { type: 'Microsoft.Cache/redisEnterprise', name: 'cache', properties: {} },
      ],
    };
    const { resources, diagnostics } = bicepAdapter(collidingCaches);
    expect(resources).toHaveLength(2);
    expect(new Set(resources.map((r) => r.metadata.slug)).size).toBe(2);
    expect(diagnostics.some((d) => d.message.includes('Duplicate slug "cache"'))).toBe(true);
  });
});
