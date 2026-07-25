import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ResourceArtifact } from '@workspec/topology-schema';
import { describe, expect, it } from 'vitest';
import { terraformAdapter } from './terraform-adapter.js';

const fixturePath = fileURLToPath(
  new URL('../../test/fixtures/terraform/sample-show.json', import.meta.url),
);
const sampleShow: unknown = JSON.parse(readFileSync(fixturePath, 'utf-8'));

function bySlug(resources: ReturnType<typeof terraformAdapter>['resources'], slug: string) {
  const resource = resources.find((r) => r.metadata.slug === slug);
  if (!resource) throw new Error(`expected a resource with slug "${slug}"`);
  return resource;
}

describe('terraformAdapter', () => {
  it('maps every representative azurerm_* resource to a Resource artifact', () => {
    const { resources } = terraformAdapter(sampleShow);
    expect(resources.map((r) => r.metadata.slug).sort()).toEqual(
      [
        'cache',
        'core-vnet',
        'front-door',
        'rg-app',
        'snet-workload',
        'sql',
        'redis-pe',
        'web-app',
      ].sort(),
    );
  });

  it('every produced resource validates against ResourceArtifact', () => {
    const { resources } = terraformAdapter(sampleShow);
    for (const resource of resources) {
      expect(() => ResourceArtifact.parse(resource)).not.toThrow();
    }
  });

  it('every produced resource is marked derived with a terraform-address provenance', () => {
    const { resources } = terraformAdapter(sampleShow);
    for (const resource of resources) {
      expect(resource.spec.source?.kind).toBe('derived');
      expect(resource.spec.source?.from).toBeTruthy();
    }
    expect(bySlug(resources, 'web-app').spec.source?.from).toBe('azurerm_linux_web_app.web');
    expect(bySlug(resources, 'core-vnet').spec.source?.from).toBe(
      'module.network.azurerm_virtual_network.core',
    );
  });

  it('maps kinds and vendor display types per the vendor→kind catalog', () => {
    const { resources } = terraformAdapter(sampleShow);
    expect(bySlug(resources, 'rg-app').spec).toMatchObject({
      kind: 'resource-group',
      type: 'Azure Resource Group',
    });
    expect(bySlug(resources, 'web-app').spec).toMatchObject({
      kind: 'compute',
      type: 'Azure App Service',
    });
    expect(bySlug(resources, 'cache').spec).toMatchObject({
      kind: 'cache',
      type: 'Azure Cache for Redis',
    });
    expect(bySlug(resources, 'sql').spec).toMatchObject({
      kind: 'database',
      type: 'Azure SQL Database',
    });
    expect(bySlug(resources, 'redis-pe').spec).toMatchObject({
      kind: 'endpoint',
      type: 'Private Endpoint',
    });
    expect(bySlug(resources, 'core-vnet').spec).toMatchObject({
      kind: 'vnet',
      type: 'Azure Virtual Network',
    });
    expect(bySlug(resources, 'snet-workload').spec).toMatchObject({
      kind: 'subnet',
      type: 'Azure Subnet',
    });
    expect(bySlug(resources, 'front-door').spec).toMatchObject({
      kind: 'edge',
      type: 'Azure Front Door',
    });
  });

  it('resolves resourceGroup for every resource that declared resource_group_name', () => {
    const { resources } = terraformAdapter(sampleShow);
    for (const slug of [
      'web-app',
      'cache',
      'sql',
      'redis-pe',
      'front-door',
      'core-vnet',
      'snet-workload',
    ]) {
      expect(bySlug(resources, slug).spec.resourceGroup).toBe('rg-app');
    }
  });

  it('derives subnet-network placement: subnet points at its parent vnet', () => {
    const { resources } = terraformAdapter(sampleShow);
    expect(bySlug(resources, 'snet-workload').spec.network).toBe('core-vnet');
  });

  it('derives private-endpoint network placement from its subnet_id', () => {
    const { resources } = terraformAdapter(sampleShow);
    expect(bySlug(resources, 'redis-pe').spec.network).toBe('snet-workload');
  });

  it('curates config for vnet, subnet, cache, sql, and private endpoint', () => {
    const { resources } = terraformAdapter(sampleShow);
    expect(bySlug(resources, 'core-vnet').spec.config).toEqual({ addressSpace: ['10.0.0.0/16'] });
    expect(bySlug(resources, 'snet-workload').spec.config).toEqual({ prefix: '10.0.1.0/24' });
    expect(bySlug(resources, 'cache').spec.config).toEqual({
      skuName: 'Standard',
      family: 'C',
      capacity: 1,
    });
    expect(bySlug(resources, 'sql').spec.config).toEqual({ sku: 'GP_Gen5_2' });
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

  it('emits a diagnostic for an unmapped azurerm_* type and skips it', () => {
    const { resources, diagnostics } = terraformAdapter(sampleShow);
    expect(resources.some((r) => r.metadata.slug === 'pip')).toBe(false);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      severity: 'warning',
      source: 'azurerm_public_ip.unmapped',
    });
    expect(diagnostics[0]?.message).toContain('azurerm_public_ip');
  });

  it('falls back to planned_values.root_module for a plan document', () => {
    const asPlan = { planned_values: sampleShow && (sampleShow as { values: unknown }).values };
    const { resources } = terraformAdapter(asPlan);
    expect(resources.length).toBeGreaterThan(0);
  });

  it('returns no resources and no throw for a malformed/empty input', () => {
    expect(terraformAdapter({})).toEqual({ resources: [], diagnostics: [] });
    expect(terraformAdapter(null)).toEqual({ resources: [], diagnostics: [] });
    expect(terraformAdapter('not an object')).toEqual({ resources: [], diagnostics: [] });
  });

  it('disambiguates two same-named resources in different resource groups instead of dropping one (regression: previously both slugged "cache", second silently won)', () => {
    const twoResourceGroupsSharingAName = {
      values: {
        root_module: {
          resources: [
            {
              address: 'azurerm_redis_cache.a',
              type: 'azurerm_redis_cache',
              name: 'a',
              values: { name: 'cache', resource_group_name: 'rg-one' },
            },
            {
              address: 'azurerm_redis_cache.b',
              type: 'azurerm_redis_cache',
              name: 'b',
              values: { name: 'cache', resource_group_name: 'rg-two' },
            },
          ],
        },
      },
    };

    const { resources, diagnostics } = terraformAdapter(twoResourceGroupsSharingAName);

    expect(resources).toHaveLength(2);
    const slugs = resources.map((r) => r.metadata.slug).sort();
    expect(new Set(slugs).size).toBe(2); // neither resource was overwritten by the other
    expect(slugs).toEqual(['cache-rg-one', 'cache-rg-two']);
    expect(resources.map((r) => r.spec.source?.from).sort()).toEqual([
      'azurerm_redis_cache.a',
      'azurerm_redis_cache.b',
    ]);
    expect(
      diagnostics.some(
        (d) => d.severity === 'warning' && d.message.includes('Duplicate slug "cache"'),
      ),
    ).toBe(true);
  });
});
