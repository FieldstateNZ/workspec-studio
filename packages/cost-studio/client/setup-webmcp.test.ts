import { createMemoryRepository } from '@workspec/cost-schema';
import type { Inventory } from '@workspec/cost-schema';
import { describe, expect, it, vi } from 'vitest';
import {
  COST_SETUP_WEBMCP_TOOL_NAMES,
  CostSetupWebMcpService,
  createCostSetupWebMcpTools,
} from './setup-webmcp.js';

const INVENTORY_REF = '.workspec/inventories/estate.yaml';

function inventory(): Inventory {
  return {
    apiVersion: 'workspec.io/v1alpha1',
    kind: 'Inventory',
    metadata: { slug: 'estate' },
    spec: {
      asOf: '2026-09-01T00:00:00.000Z',
      scope: { subscriptions: ['sub-1'] },
      resources: [
        {
          id: 'a',
          name: 'API',
          type: 'Microsoft.Web/sites',
          location: 'australiaeast',
          resourceGroup: 'rg-product-a',
          subscription: 'sub-1',
          tags: { product: 'alpha', owner: 'platform' },
        },
        {
          id: 'b',
          name: 'Shared',
          type: 'Microsoft.Storage/storageAccounts',
          location: 'australiaeast',
          resourceGroup: 'rg-shared',
          subscription: 'sub-1',
          tags: { product: 'shared' },
        },
      ],
    },
  };
}

function service() {
  const repository = createMemoryRepository({ inventories: { [INVENTORY_REF]: inventory() } });
  const onAttributionWritten = vi.fn();
  return {
    repository,
    onAttributionWritten,
    service: new CostSetupWebMcpService({
      repository,
      inventoryRef: INVENTORY_REF,
      onAttributionWritten,
    }),
  };
}

describe('Cost setup WebMCP tools', () => {
  it('summarises a real stocktake without changing it', async () => {
    const { service: setup } = service();
    await expect(setup.inspect()).resolves.toMatchObject({
      resourceCount: 2,
      subscriptions: ['sub-1'],
      resourceGroups: ['rg-product-a', 'rg-shared'],
      observedTags: { owner: ['platform'], product: ['alpha', 'shared'] },
    });
  });

  it('creates a validated first attribution and refuses to overwrite it', async () => {
    const { repository, service: setup, onAttributionWritten } = service();
    const input = {
      slug: 'estate',
      name: 'Estate cost model',
      dimensionId: 'product',
      dimensionLabel: 'Product',
      values: ['alpha', 'shared'],
    };
    await expect(setup.create(input)).resolves.toMatchObject({
      persisted: true,
      attributionRef: '.workspec/attributions/estate.yaml',
      ruleCount: 0,
    });
    await expect(
      repository.readAttribution('.workspec/attributions/estate.yaml'),
    ).resolves.toMatchObject({
      metadata: { slug: 'estate' },
      spec: { dimensions: [{ id: 'product', values: ['alpha', 'shared'] }], rules: [] },
    });
    expect(onAttributionWritten).toHaveBeenCalledOnce();
    await expect(setup.create(input)).rejects.toThrow('never overwrites');
  });

  it('publishes one read tool and one explicit write tool', () => {
    const tools = createCostSetupWebMcpTools(service().service);
    expect(tools.map((tool) => tool.name)).toEqual(COST_SETUP_WEBMCP_TOOL_NAMES);
    expect(tools[0]?.annotations?.readOnlyHint).toBe(true);
    expect(tools[1]?.annotations?.readOnlyHint).toBe(false);
  });
});
