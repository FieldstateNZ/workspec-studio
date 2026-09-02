import { unzipSync, strFromU8 } from 'fflate';
import {
  parseAttributionYaml,
  parseInventoryYaml,
  parseSpendYaml,
  parseTagPlanYaml,
} from '@workspec/cost-schema';
import { describe, expect, it, vi } from 'vitest';

import { CostWebMcpService } from './cost-webmcp.js';
import {
  CostSetupWebMcpService,
  CostSnapshotWebMcpService,
  buildCostSnapshot,
  buildWorkspecBundle,
  createSnapshotRepository,
  createSnapshotTool,
  stateFromSnapshot,
} from './cost-snapshot.js';

const input = {
  estateName: 'Acme Azure',
  provider: 'azure',
  asOf: '2026-09-02T00:00:00Z',
  period: '2026-09',
  currency: 'nzd',
  resources: [
    {
      id: '/subscriptions/acme/resourceGroups/rg-payments/providers/Microsoft.Compute/vm-2',
      name: 'payments-2',
      type: 'Microsoft.Compute/virtualMachines',
      location: 'australiaeast',
      resourceGroup: 'rg-payments',
      account: 'acme',
      tags: { env: 'prod' },
      monthlySpend: 125,
      serviceCategory: 'Virtual Machines',
    },
    {
      id: '/subscriptions/acme/resourceGroups/rg-platform/providers/Microsoft.Storage/store-1',
      name: 'platform-store',
      type: 'Microsoft.Storage/storageAccounts',
      location: 'australiaeast',
      resourceGroup: 'rg-platform',
      account: 'acme',
      monthlySpend: 75,
      serviceCategory: 'Storage',
    },
  ],
};

describe('hosted cost snapshot workflow', () => {
  it('validates and normalizes a provider-neutral snapshot', () => {
    const snapshot = buildCostSnapshot(input);
    expect(snapshot.inventoryRef).toBe('.workspec/inventories/estate.yaml');
    expect(snapshot.spendRef).toBe('.workspec/spends/estate-2026-09.yaml');
    expect(snapshot.inventory.spec.scope.subscriptions).toEqual(['acme']);
    expect(snapshot.inventory.spec.resources.map((resource) => resource.id)).toEqual(
      [...snapshot.inventory.spec.resources.map((resource) => resource.id)].sort(),
    );
    expect(snapshot.spend.spec.rows).toHaveLength(2);
    expect(snapshot.spend.spec.rows[0]?.currency).toBe('NZD');
  });

  it('rejects the whole payload before replacing visible state', async () => {
    const onLoaded = vi.fn();
    const tool = createSnapshotTool(new CostSnapshotWebMcpService(onLoaded));
    const result = await tool.execute({
      ...input,
      resources: [{ ...input.resources[0], monthlySpend: 'lots' }],
    });
    expect(result).toMatchObject({ ok: false, error: { code: 'snapshot_failed' } });
    expect(onLoaded).not.toHaveBeenCalled();
  });

  it('runs import, setup, attribution, and validated ZIP export end to end', async () => {
    const snapshot = buildCostSnapshot(input);
    const repository = createSnapshotRepository(stateFromSnapshot(snapshot, 1));
    let attributionRef = '';
    const setup = new CostSetupWebMcpService(repository, snapshot.inventoryRef, (ref) => {
      attributionRef = ref;
    });

    await expect(setup.inspect()).resolves.toMatchObject({
      resourceCount: 2,
      resourceGroups: ['rg-payments', 'rg-platform'],
    });
    await expect(
      setup.create({
        name: 'Product ownership',
        dimensionId: 'product',
        dimensionLabel: 'Product',
        values: ['payments', 'platform'],
      }),
    ).resolves.toMatchObject({ attributionRef: '.workspec/attributions/product.yaml' });

    const cost = new CostWebMcpService({
      repository,
      inventoryRef: snapshot.inventoryRef,
      attributionRef,
      proposalIdFactory: () => 'proposal',
    });
    for (const [resourceGroup, value] of [
      ['rg-payments', 'payments'],
      ['rg-platform', 'platform'],
    ] as const) {
      const preview = await cost.previewAttributionRule({ resourceGroup, value });
      await cost.applyAttributionRule({ proposalId: preview.proposalId });
    }
    await expect(cost.getOverview()).resolves.toMatchObject({ coverage: { percent: 100 } });

    const bundle = await buildWorkspecBundle(
      repository,
      snapshot.inventoryRef,
      snapshot.spendRef,
      attributionRef,
      '2026-09',
    );
    expect(bundle.files).toEqual([
      '.workspec/inventories/estate.yaml',
      '.workspec/spends/estate-2026-09.yaml',
      '.workspec/attributions/product.yaml',
      '.workspec/tagplans/2026-09.yaml',
    ]);
    const files = unzipSync(bundle.bytes);
    const inventory = parseInventoryYaml(strFromU8(files[bundle.files[0]!]!));
    const spend = parseSpendYaml(strFromU8(files[bundle.files[1]!]!));
    const attribution = parseAttributionYaml(strFromU8(files[bundle.files[2]!]!));
    const tagPlan = parseTagPlanYaml(strFromU8(files[bundle.files[3]!]!));
    expect(inventory.ok).toBe(true);
    expect(spend.ok).toBe(true);
    expect(attribution.ok).toBe(true);
    expect(tagPlan.ok).toBe(true);
    if (tagPlan.ok) {
      expect(tagPlan.data.spec.tagMapping).toEqual({ product: 'workspec-product' });
      expect(tagPlan.data.spec.entries).toHaveLength(2);
      expect(tagPlan.data.spec.entries.every((entry) => entry.action === 'add')).toBe(true);
    }
  });
});
