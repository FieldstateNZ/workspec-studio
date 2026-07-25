import { ResourceArtifact } from '@workspec/topology-schema';
import { describe, expect, it } from 'vitest';
import { buildDerivedResource } from './build-derived-resource.js';

describe('buildDerivedResource', () => {
  it('builds the K8s-style envelope with spec.source marked derived', () => {
    const resource = buildDerivedResource({
      slug: 'web-app',
      name: 'web-app',
      kind: 'compute',
      type: 'App Service',
      provider: 'azure',
      from: 'azurerm_linux_web_app.web',
    });

    expect(resource).toEqual({
      apiVersion: 'workspec.io/v1alpha1',
      kind: 'Resource',
      metadata: { slug: 'web-app' },
      spec: {
        name: 'web-app',
        kind: 'compute',
        type: 'App Service',
        provider: 'azure',
        source: { kind: 'derived', from: 'azurerm_linux_web_app.web' },
      },
    });
    expect(() => ResourceArtifact.parse(resource)).not.toThrow();
  });

  it('omits network/resourceGroup/config when undefined rather than writing them as `undefined`', () => {
    const resource = buildDerivedResource({
      slug: 'rg-app',
      name: 'rg-app',
      kind: 'resource-group',
      type: 'Resource Group',
      provider: 'azure',
      from: 'azurerm_resource_group.app',
    });

    expect(resource.spec).not.toHaveProperty('network');
    expect(resource.spec).not.toHaveProperty('resourceGroup');
    expect(resource.spec).not.toHaveProperty('config');
  });

  it('includes network/resourceGroup/config when provided', () => {
    const resource = buildDerivedResource({
      slug: 'snet-workload',
      name: 'snet-workload',
      kind: 'subnet',
      type: 'Subnet',
      provider: 'azure',
      network: 'core-vnet',
      resourceGroup: 'rg-app',
      config: { prefix: '10.0.1.0/24' },
      from: 'module.network.azurerm_subnet.workload',
    });

    expect(resource.spec.network).toBe('core-vnet');
    expect(resource.spec.resourceGroup).toBe('rg-app');
    expect(resource.spec.config).toEqual({ prefix: '10.0.1.0/24' });
  });
});
