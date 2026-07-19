// The C4 acceptance test (issue #18's bar): the full stocktake -> report ->
// plan -> apply -> re-stocktake loop, against a real `FsRepository` on a temp
// directory (so file naming — the stable inventory path, the period-named
// spend/tagplan files — is actually exercised) and an injected
// `createMemoryProvider` (so no real cloud call happens). Also covers the
// two safety-critical edges called out by the issue: `apply` refusing on
// live drift, and `--dry-run` mutating nothing.

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMemoryProvider } from '@workspec/cost-provider';
import type { Attribution, Inventory, Spend } from '@workspec/cost-schema';
import { run } from './cli.js';
import type { CliIO } from './cli.js';
import { FsRepository } from './fs-repository.js';

/** Narrows a possibly-undefined lookup/index result, failing the test loudly if absent. */
function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('expected value to be defined');
  return value;
}

// Capturing IO double (factory-built per call).
function captureIO(): { io: CliIO; out: () => string; err: () => string } {
  let out = '';
  let err = '';
  return {
    io: { out: (t) => (out += t), err: (t) => (err += t) },
    out: () => out,
    err: () => err,
  };
}

// ── The mini estate: 6 resources, some tagged wrong/missing, sorted by id ──

function makeSeedInventory(): Inventory {
  return {
    apiVersion: 'workspec.io/v1alpha1',
    kind: 'Inventory',
    metadata: { slug: 'seed' },
    spec: {
      asOf: '2026-06-01T00:00:00.000Z',
      scope: { subscriptions: ['sub-1'] },
      resources: [
        {
          id: 'res-network-1',
          name: 'Load Balancer',
          type: 'Microsoft.Network/loadBalancers',
          location: 'australiaeast',
          resourceGroup: 'rg-app',
          subscription: 'sub-1',
          tags: { 'fs-product': 'workspec' }, // already correct -> noop
        },
        {
          id: 'res-override-1',
          name: 'Override VM',
          type: 'Microsoft.Compute/virtualMachines',
          location: 'australiaeast',
          resourceGroup: 'rg-app',
          subscription: 'sub-1',
          tags: { 'fs-product': 'atrium' }, // wrong -> pinned to workspec by the override
        },
        {
          id: 'res-shared-1',
          name: 'Shared Storage',
          type: 'Microsoft.Storage/storageAccounts',
          location: 'australiaeast',
          resourceGroup: 'rg-shared',
          subscription: 'sub-1',
        },
        {
          id: 'res-storage-1',
          name: 'Storage One',
          type: 'Microsoft.Storage/storageAccounts',
          location: 'australiaeast',
          resourceGroup: 'rg-app',
          subscription: 'sub-1',
        },
        {
          id: 'res-vm-1',
          name: 'VM One',
          type: 'Microsoft.Compute/virtualMachines',
          location: 'australiaeast',
          resourceGroup: 'rg-app',
          subscription: 'sub-1',
        },
        {
          id: 'res-vm-2',
          name: 'VM Two',
          type: 'Microsoft.Compute/virtualMachines',
          location: 'australiaeast',
          resourceGroup: 'rg-app',
          subscription: 'sub-1',
          tags: { 'fs-product': 'workspec' }, // wrong -> corrected to atrium by r1
        },
      ],
    },
  };
}

function makeSeedSpend(): Spend {
  return {
    apiVersion: 'workspec.io/v1alpha1',
    kind: 'Spend',
    metadata: { slug: 'seed-spend' },
    spec: {
      rows: [
        { resourceId: 'res-network-1', amount: 30, currency: 'NZD', period: '2026-07', serviceCategory: 'Networking' },
        { resourceId: 'res-override-1', amount: 120, currency: 'NZD', period: '2026-07', serviceCategory: 'Virtual Machines' },
        { resourceId: 'res-shared-1', amount: 80, currency: 'NZD', period: '2026-07', serviceCategory: 'Storage' },
        { resourceId: 'res-storage-1', amount: 50, currency: 'NZD', period: '2026-07', serviceCategory: 'Storage' },
        { resourceId: 'res-vm-1', amount: 100, currency: 'NZD', period: '2026-07', serviceCategory: 'Virtual Machines' },
        { resourceId: 'res-vm-2', amount: 200, currency: 'NZD', period: '2026-07', serviceCategory: 'Virtual Machines' },
      ],
    },
  };
}

/** Two dimensions, 4 rules (incl. one split), 1 override — the fixture the acceptance test writes into the repository. */
function makeAttribution(): Attribution {
  return {
    apiVersion: 'workspec.io/v1alpha1',
    kind: 'Attribution',
    metadata: { slug: 'prod' },
    spec: {
      dimensions: [
        { id: 'product', label: 'Product', values: ['atrium', 'workspec'] },
        { id: 'costType', label: 'Cost Type', values: ['compute', 'storage'] },
      ],
      rules: [
        {
          id: 'r1',
          name: 'VMs',
          match: { resourceType: 'Microsoft.Compute/virtualMachines' },
          assign: { product: 'atrium', costType: 'compute' },
        },
        {
          id: 'r2',
          name: 'Storage',
          match: { resourceType: 'Microsoft.Storage/storageAccounts' },
          assign: { costType: 'storage' },
        },
        {
          id: 'r3',
          name: 'Shared storage splits product',
          match: { resourceGroup: 'rg-shared' },
          split: { product: { atrium: 0.5, workspec: 0.5 } },
        },
        { id: 'r4', name: 'Catch-all', match: {}, assign: { product: 'workspec' } },
      ],
      overrides: [{ resourceId: 'res-override-1', assign: { product: 'workspec' } }],
    },
  };
}

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cost-studio-acceptance-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('cost-studio acceptance: stocktake -> report -> plan -> apply -> re-stocktake', () => {
  it('runs the full loop, converges tags, and a second plan is all-noop', async () => {
    const repository = new FsRepository(dir);
    const provider = createMemoryProvider({ inventory: makeSeedInventory(), spend: [makeSeedSpend()] });
    await repository.writeAttribution('.workspec/attributions/prod.yaml', makeAttribution());

    // 1. stocktake.
    const stocktakeCap = captureIO();
    const stocktakeCode = await run(
      ['stocktake', '--subscription', 'sub-1', '--period', '2026-07'],
      stocktakeCap.io,
      { repository, provider },
    );
    expect(stocktakeCode).toBe(0);
    expect(await repository.listInventories()).toEqual([
      { ref: '.workspec/inventories/estate.yaml', slug: 'estate' },
    ]);
    expect(await repository.listSpends()).toEqual([
      { ref: '.workspec/spends/estate-2026-07.yaml', slug: 'estate-2026-07' },
    ]);

    // 2. report — coverage headline for the primary dimension ("product").
    const reportCap = captureIO();
    const reportCode = await run(['report'], reportCap.io, { repository });
    expect(reportCode).toBe(0);
    expect(reportCap.out()).toContain('coverage[product] 100.0% · $0/mo unattributed · 0 resources');

    const reportJsonCap = captureIO();
    await run(['report', '--format', 'json'], reportJsonCap.io, { repository });
    const reportJson = JSON.parse(reportJsonCap.out()) as {
      totals: { inventorySpend: number };
      coverage: { dimensionId: string; unattributedSpend: number; unattributedCount: number }[];
    };
    expect(reportJson.totals.inventorySpend).toBe(580);
    const costTypeCoverage = must(reportJson.coverage.find((c) => c.dimensionId === 'costType'));
    expect(costTypeCoverage.unattributedSpend).toBe(30); // res-network-1, unresolved on costType
    expect(costTypeCoverage.unattributedCount).toBe(1);

    // 3. plan.
    const planCap = captureIO();
    const planCode = await run(['plan'], planCap.io, { repository });
    expect(planCode).toBe(0);
    expect(planCap.err()).toContain('plan: +8 add · ~2 change · −0 remove · 1 noop');
    const planRefs = await repository.listTagPlans();
    expect(planRefs).toEqual([{ ref: '.workspec/tagplans/2026-07.yaml', slug: '2026-07' }]);
    const firstPlan = await repository.readTagPlan('.workspec/tagplans/2026-07.yaml');
    expect(firstPlan.spec.tagMapping).toEqual({ product: 'fs-product', costType: 'fs-cost-type' });
    expect(firstPlan.spec.entries).toHaveLength(11);

    // 4. apply.
    const applyCap = captureIO();
    const applyCode = await run(['apply', '.workspec/tagplans/2026-07.yaml'], applyCap.io, {
      repository,
      provider,
    });
    expect(applyCode).toBe(0);
    expect(applyCap.err()).toContain('apply: 10 applied · 1 noop · 0 failed');

    // 5. re-stocktake — drift summary should report exactly the tag changes just applied.
    const restockCap = captureIO();
    const restockCode = await run(
      ['stocktake', '--subscription', 'sub-1', '--period', '2026-07'],
      restockCap.io,
      { repository, provider },
    );
    expect(restockCode).toBe(0);
    expect(restockCap.err()).toContain(
      'stocktake: 5 drifts: +0 appeared · −0 disappeared · ~5 tags changed',
    );

    // 6. the new inventory's tags match the plan's desired values.
    const converged = await repository.readInventory('.workspec/inventories/estate.yaml');
    const tagsOf = (id: string): Record<string, string> | undefined =>
      must(converged.spec.resources.find((r) => r.id === id)).tags;
    expect(tagsOf('res-vm-1')).toEqual({ 'fs-product': 'atrium', 'fs-cost-type': 'compute' });
    expect(tagsOf('res-vm-2')).toEqual({ 'fs-product': 'atrium', 'fs-cost-type': 'compute' });
    expect(tagsOf('res-storage-1')).toEqual({ 'fs-product': 'workspec', 'fs-cost-type': 'storage' });
    expect(tagsOf('res-shared-1')).toEqual({
      'fs-product': 'atrium:50|workspec:50',
      'fs-cost-type': 'storage',
    });
    expect(tagsOf('res-override-1')).toEqual({ 'fs-product': 'workspec', 'fs-cost-type': 'compute' });
    expect(tagsOf('res-network-1')).toEqual({ 'fs-product': 'workspec' });

    // 7. a second plan yields zero non-noop entries.
    const secondPlanCap = captureIO();
    const secondPlanCode = await run(['plan'], secondPlanCap.io, { repository });
    expect(secondPlanCode).toBe(0);
    expect(secondPlanCap.err()).toContain('plan: +0 add · ~0 change · −0 remove · 11 noop');
  });

  it('apply refuses (no writes) when live state has drifted since the plan was computed', async () => {
    const repository = new FsRepository(dir);
    const provider = createMemoryProvider({ inventory: makeSeedInventory(), spend: [makeSeedSpend()] });
    await repository.writeAttribution('.workspec/attributions/prod.yaml', makeAttribution());

    await run(['stocktake', '--subscription', 'sub-1', '--period', '2026-07'], captureIO().io, {
      repository,
      provider,
    });
    await run(['plan'], captureIO().io, { repository });

    // Someone hand-edits a tag outside WorkSpec after the plan was computed.
    provider.mutateLive('res-vm-1', { 'hand-edited': 'true' });

    const cap = captureIO();
    const code = await run(['apply', '.workspec/tagplans/2026-07.yaml'], cap.io, { repository, provider });
    expect(code).toBe(1);
    expect(cap.err()).toContain('refusing');
    expect(cap.err()).toContain('re-stocktake and re-plan');

    const stillLive = await provider.fetchInventory({ subscriptions: ['sub-1'] });
    const vm1 = must(stillLive.spec.resources.find((r) => r.id === 'res-vm-1'));
    expect(vm1.tags?.['fs-product']).toBeUndefined();
  });

  it('--dry-run mutates nothing', async () => {
    const repository = new FsRepository(dir);
    const provider = createMemoryProvider({ inventory: makeSeedInventory(), spend: [makeSeedSpend()] });
    await repository.writeAttribution('.workspec/attributions/prod.yaml', makeAttribution());

    await run(['stocktake', '--subscription', 'sub-1', '--period', '2026-07'], captureIO().io, {
      repository,
      provider,
    });
    await run(['plan'], captureIO().io, { repository });

    const cap = captureIO();
    const code = await run(['apply', '.workspec/tagplans/2026-07.yaml', '--dry-run'], cap.io, {
      repository,
      provider,
    });
    expect(code).toBe(0);
    expect(cap.err()).toContain('(dry run)');

    const stillLive = await provider.fetchInventory({ subscriptions: ['sub-1'] });
    const vm1 = must(stillLive.spec.resources.find((r) => r.id === 'res-vm-1'));
    expect(vm1.tags?.['fs-product']).toBeUndefined();
    const vm2 = must(stillLive.spec.resources.find((r) => r.id === 'res-vm-2'));
    expect(vm2.tags?.['fs-product']).toBe('workspec'); // unchanged from the seed
  });
});
