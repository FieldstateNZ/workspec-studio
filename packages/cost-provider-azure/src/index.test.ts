import { describe, expect, it } from 'vitest';
import { CLOUD_PROVIDER_METHODS, COST_PROVIDER_PACKAGE } from '@workspec/cost-provider';
import { COST_SCHEMA_PACKAGE } from '@workspec/cost-schema';
import { COST_PROVIDER_AZURE_PACKAGE, createAzureProvider } from './index.js';
import type { AzureHttp } from './http.js';

describe('@workspec/cost-provider-azure', () => {
  it('exports its package identity', () => {
    expect(COST_PROVIDER_AZURE_PACKAGE).toBe('@workspec/cost-provider-azure');
  });

  it('can import its cost-provider and cost-schema dependencies (proves alias + references wiring)', () => {
    expect(COST_PROVIDER_PACKAGE).toBe('@workspec/cost-provider');
    expect(COST_SCHEMA_PACKAGE).toBe('@workspec/cost-schema');
  });

  it('createAzureProvider wires a real CloudProviderPort (no credential construction needed when http is injected)', async () => {
    const http: AzureHttp = {
      request() {
        return Promise.resolve({ status: 200, headers: {}, body: { data: [] } });
      },
    };
    const provider = createAzureProvider({ http, clock: () => '2024-01-01T00:00:00.000Z' });

    for (const method of CLOUD_PROVIDER_METHODS) {
      expect(typeof provider[method]).toBe('function');
    }

    const inventory = await provider.fetchInventory({ subscriptions: ['sub-1'] });
    expect(inventory.spec.resources).toEqual([]);
    expect(inventory.spec.asOf).toBe('2024-01-01T00:00:00.000Z');
  });
});
