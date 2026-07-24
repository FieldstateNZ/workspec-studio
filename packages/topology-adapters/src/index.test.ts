import { describe, expect, it } from 'vitest';
import {
  ADAPTERS,
  TOPOLOGY_ADAPTERS_PACKAGE,
  VENDOR_KIND_CATALOG,
  bicepAdapter,
  resourceGraphAdapter,
  terraformAdapter,
} from './index.js';

describe('@workspec/topology-adapters', () => {
  it('exports its package identity', () => {
    expect(TOPOLOGY_ADAPTERS_PACKAGE).toBe('@workspec/topology-adapters');
  });

  it('exports all three adapters directly and via the registry, referencing the same functions', () => {
    expect(ADAPTERS.terraform).toBe(terraformAdapter);
    expect(ADAPTERS.bicep).toBe(bicepAdapter);
    expect(ADAPTERS['azure-resource-graph']).toBe(resourceGraphAdapter);
  });

  it('exports the shared vendor→kind catalog', () => {
    expect(Object.keys(VENDOR_KIND_CATALOG)).toContain('appService');
    expect(VENDOR_KIND_CATALOG.appService).toEqual({ kind: 'compute', type: 'Azure App Service' });
  });
});
