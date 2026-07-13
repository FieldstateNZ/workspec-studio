import { describe, expect, it } from 'vitest';
import { InventoryArtifact, serializeInventoryYaml } from '@workspec/cost-schema';
import { fetchAzureInventory } from '../src/inventory.js';
import { createFixtureHttp, loadFixture } from './support/fixture-http.js';

const FIXED_CLOCK = (): string => '2024-06-01T00:00:00.000Z';

describe('fetchAzureInventory — multi-page Resource Graph pagination', () => {
  it('pages via $skipToken to exhaustion, lowercases ids, sorts, and omits empty/null tags', async () => {
    const fixtures = await loadFixture('inventory-multi-page.json');
    const fixtureHttp = createFixtureHttp(fixtures);

    const inventory = await fetchAzureInventory(
      { subscriptions: ['sub-1'] },
      { http: fixtureHttp.http, clock: FIXED_CLOCK },
    );

    fixtureHttp.assertExhausted();
    expect(fixtureHttp.requestsMade).toHaveLength(2);

    expect(inventory.spec.asOf).toBe('2024-06-01T00:00:00.000Z');
    expect(inventory.spec.resources.map((r) => r.id)).toEqual([
      '/subscriptions/sub-1/resourcegroups/rg1/providers/microsoft.compute/virtualmachines/vm-a',
      '/subscriptions/sub-1/resourcegroups/rg1/providers/microsoft.compute/virtualmachines/vm-b',
      '/subscriptions/sub-1/resourcegroups/rg1/providers/microsoft.storage/storageaccounts/stg1',
    ]);

    const byId = new Map(inventory.spec.resources.map((r) => [r.id, r]));
    expect(byId.get('/subscriptions/sub-1/resourcegroups/rg1/providers/microsoft.compute/virtualmachines/vm-b')?.tags).toEqual({
      env: 'prod',
    });
    expect(byId.get('/subscriptions/sub-1/resourcegroups/rg1/providers/microsoft.compute/virtualmachines/vm-a')?.tags).toBeUndefined();
    expect(byId.get('/subscriptions/sub-1/resourcegroups/rg1/providers/microsoft.storage/storageaccounts/stg1')?.tags).toBeUndefined();

    expect(InventoryArtifact.safeParse(inventory).success).toBe(true);
  });

  it('maps an empty/missing location to "global" rather than dropping the resource', async () => {
    const fixtures = [
      {
        request: {
          method: 'POST' as const,
          url: 'https://management.azure.com/providers/Microsoft.ResourceGraph/resources?api-version=2022-10-01',
        },
        response: {
          status: 200,
          headers: {},
          body: {
            data: [
              {
                id: '/subscriptions/sub-1/resourceGroups/rg1/providers/Microsoft.Resources/resourceGroups/rg1',
                name: 'rg1',
                type: 'Microsoft.Resources/resourceGroups',
                location: '',
                resourceGroup: 'rg1',
                subscriptionId: 'sub-1',
                tags: null,
              },
            ],
          },
        },
      },
    ];
    const fixtureHttp = createFixtureHttp(fixtures);

    const inventory = await fetchAzureInventory(
      { subscriptions: ['sub-1'] },
      { http: fixtureHttp.http, clock: FIXED_CLOCK },
    );

    expect(inventory.spec.resources).toHaveLength(1);
    expect(inventory.spec.resources[0]?.location).toBe('global');
    expect(InventoryArtifact.safeParse(inventory).success).toBe(true);
  });

  it('rejects an empty scope', async () => {
    await expect(fetchAzureInventory({ subscriptions: [] }, { http: createFixtureHttp([]).http })).rejects.toThrow(
      /scope.subscriptions must be non-empty/,
    );
  });

  it('is byte-stable: two identical fetches (fixed clock) serialize identically', async () => {
    const [fixturesA, fixturesB] = await Promise.all([
      loadFixture('inventory-multi-page.json'),
      loadFixture('inventory-multi-page.json'),
    ]);

    const inventoryA = await fetchAzureInventory(
      { subscriptions: ['sub-1'] },
      { http: createFixtureHttp(fixturesA).http, clock: FIXED_CLOCK },
    );
    const inventoryB = await fetchAzureInventory(
      { subscriptions: ['sub-1'] },
      { http: createFixtureHttp(fixturesB).http, clock: FIXED_CLOCK },
    );

    expect(serializeInventoryYaml(inventoryA)).toBe(serializeInventoryYaml(inventoryB));
  });
});
