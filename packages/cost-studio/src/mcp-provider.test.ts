// Tests for `createCostMcpProvider` over a temp fixture dir — the same
// mkdtemp-per-test style `fs-repository.test.ts` and `server.test.ts` use, so
// this suite never shares a live fixture directory with any other suite.
//
// Tools are exercised directly via `tool.handler(args)` rather than through a
// full MCP client/transport: `McpToolDef.handler` is a plain async function,
// and `assemble-mcp-server.test.ts` (in `@workspec/mcp-core`) already covers
// the protocol-boundary (wire-name dispatch, isError-on-throw) behaviour this
// provider is mounted through.
//
// `stocktake`/`plan`/`apply` are exercised with an injected
// `createMemoryProvider` (from `@workspec/cost-provider`) — never a real
// cloud provider — mirroring `acceptance.test.ts`'s own fixture pattern.

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { McpToolDef } from '@workspec/mcp-core';
import { createMemoryProvider } from '@workspec/cost-provider';
import type { Attribution, Inventory, Spend, TagPlan } from '@workspec/cost-schema';
import { collectDiagnostics } from './collect-diagnostics.js';
import { FsRepository } from './fs-repository.js';
import { createCostMcpProvider } from './mcp-provider.js';

/** Finds a tool by its module-local name (not the namespaced wire name). */
function tool(repo: FsRepository, name: string, deps?: Parameters<typeof createCostMcpProvider>[1]): McpToolDef {
  const provider = createCostMcpProvider(repo, deps);
  const found = provider.tools.find((t) => t.name === name);
  if (found === undefined) throw new Error(`no such tool: ${name}`);
  return found;
}

/** Narrows a possibly-undefined lookup/index result, failing the test loudly if absent. */
function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('expected value to be defined');
  return value;
}

/** Extracts the first text block from a `CallToolResult` (every tool here returns exactly one). */
function textOf(result: CallToolResult): string {
  const block = result.content[0];
  if (block === undefined || block.type !== 'text') {
    throw new Error(`expected a text content block, got: ${JSON.stringify(result.content)}`);
  }
  return block.text;
}

function makeInventory(): Inventory {
  return {
    apiVersion: 'workspec.io/v1alpha1',
    kind: 'Inventory',
    metadata: { slug: 'estate' },
    spec: {
      asOf: '2026-07-01T00:00:00.000Z',
      scope: { subscriptions: ['sub-1'] },
      resources: [
        {
          id: 'res-a',
          name: 'A',
          type: 'Microsoft.Compute/virtualMachines',
          location: 'australiaeast',
          resourceGroup: 'rg-1',
          subscription: 'sub-1',
        },
        {
          id: 'res-b',
          name: 'B',
          type: 'Microsoft.Storage/storageAccounts',
          location: 'australiaeast',
          resourceGroup: 'rg-1',
          subscription: 'sub-1',
        },
      ],
    },
  };
}

function makeSpend(): Spend {
  return {
    apiVersion: 'workspec.io/v1alpha1',
    kind: 'Spend',
    metadata: { slug: 'estate-2026-07' },
    spec: {
      rows: [
        { resourceId: 'res-a', amount: 100, currency: 'NZD', period: '2026-07', serviceCategory: 'Virtual Machines' },
        { resourceId: 'res-b', amount: 50, currency: 'NZD', period: '2026-07', serviceCategory: 'Storage' },
      ],
    },
  };
}

function makeAttribution(): Attribution {
  return {
    apiVersion: 'workspec.io/v1alpha1',
    kind: 'Attribution',
    metadata: { slug: 'prod' },
    spec: {
      dimensions: [{ id: 'product', label: 'Product', values: ['atrium', 'workspec'] }],
      rules: [{ id: 'r1', name: 'Catch-all', match: {}, assign: { product: 'atrium' } }],
    },
  };
}

function makeTagPlan(): TagPlan {
  return {
    apiVersion: 'workspec.io/v1alpha1',
    kind: 'TagPlan',
    metadata: { slug: '2026-07' },
    spec: {
      baselineAsOf: '2026-07-01T00:00:00.000Z',
      tagMapping: { product: 'fs-product' },
      entries: [
        { resourceId: 'res-a', tag: 'fs-product', current: null, desired: 'atrium', action: 'add' },
        { resourceId: 'res-b', tag: 'fs-product', current: null, desired: 'atrium', action: 'add' },
      ],
    },
  };
}

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cost-mcp-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('list_inventories / read_inventory / write_inventory', () => {
  it('lists and reads a written inventory', async () => {
    const repo = new FsRepository(dir);
    await repo.writeInventory('.workspec/inventories/estate.yaml', makeInventory());

    const listResult = await tool(repo, 'list_inventories').handler({});
    expect(listResult.isError).not.toBe(true);
    const inventories = JSON.parse(textOf(listResult)) as { ref: string; slug: string }[];
    expect(inventories).toEqual(
      expect.arrayContaining([expect.objectContaining({ ref: '.workspec/inventories/estate.yaml', slug: 'estate' })]),
    );

    const readResult = await tool(repo, 'read_inventory').handler({ ref: '.workspec/inventories/estate.yaml' });
    expect(readResult.isError).not.toBe(true);
    const inventory = JSON.parse(textOf(readResult)) as Inventory;
    expect(inventory.metadata.slug).toBe('estate');
  });

  it('rejects an invalid inventory write: isError with issues, and the file is untouched', async () => {
    const repo = new FsRepository(dir);
    await repo.writeInventory('.workspec/inventories/estate.yaml', makeInventory());
    const before = await readFile(join(dir, '.workspec/inventories/estate.yaml'), 'utf8');

    const valid = await repo.readInventory('.workspec/inventories/estate.yaml');
    const invalid = structuredClone(valid) as unknown as Record<string, unknown>;
    (invalid.spec as Record<string, unknown>).asOf = 12345; // must be a string

    const result = await tool(repo, 'write_inventory').handler({
      ref: '.workspec/inventories/estate.yaml',
      inventory: invalid,
    });
    expect(result.isError).toBe(true);
    const body = JSON.parse(textOf(result)) as { issues: { path: string; message: string }[] };
    expect(body.issues.length).toBeGreaterThan(0);

    const after = await readFile(join(dir, '.workspec/inventories/estate.yaml'), 'utf8');
    expect(after).toBe(before); // untouched
  });

  it('reports an isError (not a throw) for a ref that escapes the served root, creating no file', async () => {
    const repo = new FsRepository(dir);
    const result = await tool(repo, 'write_inventory').handler({
      ref: '../outside.inventory.yaml',
      inventory: makeInventory(),
    });
    expect(result.isError).toBe(true);
    await expect(readFile(join(dir, '..', 'outside.inventory.yaml'), 'utf8')).rejects.toBeTruthy();
  });

  it('rejects a backslash-traversal ref up front, creating no garbage file', async () => {
    const repo = new FsRepository(dir);
    const badRef = String.raw`..\..\x.inventory.yaml`;
    const result = await tool(repo, 'write_inventory').handler({ ref: badRef, inventory: makeInventory() });
    expect(result.isError).toBe(true);
    await expect(readFile(join(dir, badRef), 'utf8')).rejects.toBeTruthy();
  });

  it('reports an isError (not a throw) for a missing ref', async () => {
    const repo = new FsRepository(dir);
    const result = await tool(repo, 'read_inventory').handler({ ref: '.workspec/inventories/nope.yaml' });
    expect(result.isError).toBe(true);
  });
});

describe('list_spends / read_spend / write_spend', () => {
  it('lists and reads a written spend', async () => {
    const repo = new FsRepository(dir);
    await repo.writeSpend('.workspec/spends/estate-2026-07.yaml', makeSpend());

    const listResult = await tool(repo, 'list_spends').handler({});
    expect(listResult.isError).not.toBe(true);
    expect(JSON.parse(textOf(listResult))).toEqual(
      expect.arrayContaining([expect.objectContaining({ ref: '.workspec/spends/estate-2026-07.yaml' })]),
    );

    const readResult = await tool(repo, 'read_spend').handler({ ref: '.workspec/spends/estate-2026-07.yaml' });
    expect(readResult.isError).not.toBe(true);
    const spend = JSON.parse(textOf(readResult)) as Spend;
    expect(spend.spec.rows).toHaveLength(2);
  });

  it('write_spend rejects an invalid spend without writing', async () => {
    const repo = new FsRepository(dir);
    const result = await tool(repo, 'write_spend').handler({
      ref: '.workspec/spends/bad.yaml',
      spend: { apiVersion: 'workspec.io/v1alpha1', kind: 'Spend', metadata: {}, spec: { rows: 'nope' } },
    });
    expect(result.isError).toBe(true);
    await expect(readFile(join(dir, '.workspec/spends/bad.yaml'), 'utf8')).rejects.toBeTruthy();
  });
});

describe('list_attributions / read_attribution / write_attribution', () => {
  it('lists and reads a written attribution', async () => {
    const repo = new FsRepository(dir);
    await repo.writeAttribution('.workspec/attributions/prod.yaml', makeAttribution());

    const listResult = await tool(repo, 'list_attributions').handler({});
    expect(listResult.isError).not.toBe(true);
    expect(JSON.parse(textOf(listResult))).toEqual(
      expect.arrayContaining([expect.objectContaining({ ref: '.workspec/attributions/prod.yaml' })]),
    );

    const readResult = await tool(repo, 'read_attribution').handler({ ref: '.workspec/attributions/prod.yaml' });
    expect(readResult.isError).not.toBe(true);
    const attribution = JSON.parse(textOf(readResult)) as Attribution;
    expect(attribution.spec.dimensions).toHaveLength(1);
  });

  it('write_attribution rejects an invalid attribution without writing', async () => {
    const repo = new FsRepository(dir);
    const result = await tool(repo, 'write_attribution').handler({
      ref: '.workspec/attributions/bad.yaml',
      attribution: { apiVersion: 'workspec.io/v1alpha1', kind: 'Attribution', metadata: {}, spec: {} },
    });
    expect(result.isError).toBe(true);
    await expect(readFile(join(dir, '.workspec/attributions/bad.yaml'), 'utf8')).rejects.toBeTruthy();
  });
});

describe('list_tagplans / read_tagplan / write_tagplan', () => {
  it('lists and reads a written tag plan', async () => {
    const repo = new FsRepository(dir);
    await repo.writeTagPlan('.workspec/tagplans/2026-07.yaml', makeTagPlan());

    const listResult = await tool(repo, 'list_tagplans').handler({});
    expect(listResult.isError).not.toBe(true);
    expect(JSON.parse(textOf(listResult))).toEqual(
      expect.arrayContaining([expect.objectContaining({ ref: '.workspec/tagplans/2026-07.yaml' })]),
    );

    const readResult = await tool(repo, 'read_tagplan').handler({ ref: '.workspec/tagplans/2026-07.yaml' });
    expect(readResult.isError).not.toBe(true);
    const tagPlan = JSON.parse(textOf(readResult)) as TagPlan;
    expect(tagPlan.spec.entries).toHaveLength(2);
  });

  it('write_tagplan rejects an invalid tag plan without writing', async () => {
    const repo = new FsRepository(dir);
    const result = await tool(repo, 'write_tagplan').handler({
      ref: '.workspec/tagplans/bad.yaml',
      tagPlan: { apiVersion: 'workspec.io/v1alpha1', kind: 'TagPlan', metadata: {}, spec: {} },
    });
    expect(result.isError).toBe(true);
    await expect(readFile(join(dir, '.workspec/tagplans/bad.yaml'), 'utf8')).rejects.toBeTruthy();
  });
});

describe('validate', () => {
  it('reports a clean result on valid fixtures, matching collectDiagnostics', async () => {
    const repo = new FsRepository(dir);
    await repo.writeInventory('.workspec/inventories/estate.yaml', makeInventory());
    await repo.writeAttribution('.workspec/attributions/prod.yaml', makeAttribution());

    const expected = await collectDiagnostics(repo);
    const result = await tool(repo, 'validate').handler({});
    expect(result.isError).not.toBe(true);
    expect(JSON.parse(textOf(result))).toEqual(expected);
    expect(expected).toEqual([]);
  });

  it('reports diagnostics on a known-bad fixture, matching collectDiagnostics', async () => {
    await mkdir(join(dir, '.workspec', 'inventories'), { recursive: true });
    await writeFile(
      join(dir, '.workspec', 'inventories', 'bad.yaml'),
      [
        'apiVersion: workspec.io/v1alpha1',
        'kind: Inventory',
        'metadata: {}',
        'spec:',
        '  asOf: "2026-07-01T00:00:00.000Z"',
        '  scope:',
        '    subscriptions: [sub-1]',
        '  resources:',
        '    - id: a',
        '      name: A',
        '',
      ].join('\n'),
    );
    const repo = new FsRepository(dir);
    const expected = await collectDiagnostics(repo);
    expect(expected.length).toBeGreaterThan(0);

    const result = await tool(repo, 'validate').handler({});
    expect(result.isError).not.toBe(true);
    expect(JSON.parse(textOf(result))).toEqual(expected);
  });
});

describe('report', () => {
  it('reports a coverage headline for a clean single inventory + attribution', async () => {
    const repo = new FsRepository(dir);
    await repo.writeInventory('.workspec/inventories/estate.yaml', makeInventory());
    await repo.writeAttribution('.workspec/attributions/prod.yaml', makeAttribution());
    await repo.writeSpend('.workspec/spends/estate-2026-07.yaml', makeSpend());

    const result = await tool(repo, 'report').handler({});
    expect(result.isError).not.toBe(true);
    expect(textOf(result)).toContain('coverage[product]');
  });

  it('supports --format json', async () => {
    const repo = new FsRepository(dir);
    await repo.writeInventory('.workspec/inventories/estate.yaml', makeInventory());
    await repo.writeAttribution('.workspec/attributions/prod.yaml', makeAttribution());

    const result = await tool(repo, 'report').handler({ format: 'json' });
    expect(result.isError).not.toBe(true);
    const parsed = JSON.parse(textOf(result)) as { rollup: { dimensionId: string } };
    expect(parsed.rollup.dimensionId).toBe('product');
  });

  it('reports an isError (usage problem), not a throw, when there is no inventory in scope', async () => {
    const repo = new FsRepository(dir);
    await repo.writeAttribution('.workspec/attributions/prod.yaml', makeAttribution());

    const result = await tool(repo, 'report').handler({});
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('expected exactly 1 inventory, found 0');
  });
});

describe('stocktake / plan / apply (injected fake CloudProviderPort)', () => {
  it('stocktake writes an inventory + spend via the injected provider', async () => {
    const repo = new FsRepository(dir);
    const provider = createMemoryProvider({ inventory: makeInventory(), spend: [makeSpend()] });

    const result = await tool(repo, 'stocktake', { provider }).handler({
      subscription: ['sub-1'],
      period: '2026-07',
    });
    expect(result.isError).not.toBe(true);
    const body = JSON.parse(textOf(result)) as { inventoryRef: string; spendRef: string; previousStatus: string };
    expect(body.inventoryRef).toBe('.workspec/inventories/estate.yaml');
    expect(body.previousStatus).toBe('absent');

    const written = await repo.readInventory('.workspec/inventories/estate.yaml');
    expect(written.spec.resources.map((r) => r.id)).toEqual(['res-a', 'res-b']);
  });

  it('stocktake reports an isError (usage problem) on an invalid --name, without calling the provider', async () => {
    const repo = new FsRepository(dir);
    const provider = createMemoryProvider({ inventory: makeInventory(), spend: [makeSpend()] });

    const result = await tool(repo, 'stocktake', { provider }).handler({
      subscription: ['sub-1'],
      name: 'Bad Name',
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('invalid --name "Bad Name"');
    expect(await repo.listInventories()).toEqual([]);
  });

  it('plan computes and writes a tag plan for a seeded inventory + attribution', async () => {
    const repo = new FsRepository(dir);
    await repo.writeInventory('.workspec/inventories/estate.yaml', makeInventory());
    await repo.writeAttribution('.workspec/attributions/prod.yaml', makeAttribution());

    const result = await tool(repo, 'plan').handler({});
    expect(result.isError).not.toBe(true);
    const body = JSON.parse(textOf(result)) as { outRef: string; counts: { add: number } };
    expect(body.counts.add).toBe(2);

    const plans = await repo.listTagPlans();
    expect(plans).toHaveLength(1);
    expect(must(plans[0]).ref).toBe(body.outRef);
  });

  it('plan reports an isError for a wrong inventory count', async () => {
    const repo = new FsRepository(dir);
    await repo.writeAttribution('.workspec/attributions/prod.yaml', makeAttribution());

    const result = await tool(repo, 'plan').handler({});
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('expected exactly 1 inventory, found 0');
  });

  it('apply applies a plan against the injected provider', async () => {
    const repo = new FsRepository(dir);
    const inventory = makeInventory();
    await repo.writeInventory('.workspec/inventories/estate.yaml', inventory);
    await repo.writeTagPlan('.workspec/tagplans/2026-07.yaml', makeTagPlan());
    const provider = createMemoryProvider({ inventory });

    const result = await tool(repo, 'apply', { provider }).handler({ plan: '.workspec/tagplans/2026-07.yaml' });
    expect(result.isError).not.toBe(true);
    const body = JSON.parse(textOf(result)) as { applied: number; failed: number };
    expect(body.applied).toBe(2);
    expect(body.failed).toBe(0);
  });

  it('apply refuses (isError, no mutation) when live state has drifted from the plan baseline', async () => {
    const repo = new FsRepository(dir);
    const inventory = makeInventory();
    await repo.writeInventory('.workspec/inventories/estate.yaml', inventory);
    await repo.writeTagPlan('.workspec/tagplans/2026-07.yaml', makeTagPlan());
    const provider = createMemoryProvider({ inventory });
    provider.mutateLive('res-a', { 'hand-edited': 'true' });

    const result = await tool(repo, 'apply', { provider }).handler({ plan: '.workspec/tagplans/2026-07.yaml' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('drifted');

    const stillLive = await provider.fetchInventory({ subscriptions: ['sub-1'] });
    const resA = must(stillLive.spec.resources.find((r) => r.id === 'res-a'));
    expect(resA.tags?.['fs-product']).toBeUndefined();
  });
});
