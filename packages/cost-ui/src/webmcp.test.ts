import { createMemoryRepository } from '@workspec/cost-schema';
import type { Attribution, Inventory, Spend } from '@workspec/cost-schema';
import { describe, expect, it } from 'vitest';
import { CostWebMcpService, createCostWebMcpTools } from './webmcp.js';

const inventory: Inventory = {
  apiVersion: 'workspec.io/v1alpha1',
  kind: 'Inventory',
  metadata: { slug: 'estate' },
  spec: {
    name: 'Real estate',
    asOf: '2026-09-01T00:00:00.000Z',
    scope: { subscriptions: ['sub-1'] },
    resources: [
      {
        id: 'res-1',
        name: 'API',
        type: 'Microsoft.Web/sites',
        location: 'australiaeast',
        resourceGroup: 'rg-custom',
        subscription: 'sub-1',
      },
    ],
  },
};

const spend: Spend = {
  apiVersion: 'workspec.io/v1alpha1',
  kind: 'Spend',
  metadata: { slug: 'estate-2026-09' },
  spec: {
    rows: [
      {
        resourceId: 'res-1',
        amount: 42,
        currency: 'NZD',
        period: '2026-09',
        serviceCategory: 'App Service',
      },
    ],
  },
};

const attribution: Attribution = {
  apiVersion: 'workspec.io/v1alpha1',
  kind: 'Attribution',
  metadata: { slug: 'estate' },
  spec: {
    name: 'Custom model',
    dimensions: [
      { id: 'product', label: 'Product', values: ['custom-product', 'shared-platform'] },
    ],
    rules: [],
  },
};

describe('shared Cost WebMCP service', () => {
  it('uses the current artifact values instead of demo-specific product ids', async () => {
    const repository = createMemoryRepository({
      inventories: { '.workspec/inventories/estate.yaml': inventory },
      spends: { '.workspec/spends/estate-2026-09.yaml': spend },
      attributions: { '.workspec/attributions/estate.yaml': attribution },
    });
    const service = new CostWebMcpService({
      repository,
      inventoryRef: '.workspec/inventories/estate.yaml',
      attributionRef: '.workspec/attributions/estate.yaml',
      proposalIdFactory: () => 'proposal-1',
    });

    await expect(
      service.previewAttributionRule({ resourceGroup: 'rg-custom', value: 'custom-product' }),
    ).resolves.toMatchObject({
      proposalId: 'proposal-1',
      persisted: false,
      impact: { after: { percent: 100 } },
    });
    const previewTool = createCostWebMcpTools(service).find(
      (tool) => tool.name === 'preview_attribution_rule',
    );
    expect(previewTool?.inputSchema).not.toHaveProperty('properties.value.enum');
  });
});
