import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createMemoryRepository } from '@workspec/cost-schema';
import type { Attribution, Inventory, Spend, TagPlan } from '@workspec/cost-schema';
import { createMemoryProvider } from '@workspec/cost-provider';
import { run } from './cli.js';
import type { CliIO, RunDeps } from './cli.js';
import { FsRepository } from './fs-repository.js';

/** Narrows a possibly-undefined lookup/index result, failing the test loudly if absent. */
function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('expected value to be defined');
  return value;
}

// Capturing IO double (factory-built per test).
function captureIO(): { io: CliIO; out: () => string; err: () => string } {
  let out = '';
  let err = '';
  return {
    io: { out: (t) => (out += t), err: (t) => (err += t) },
    out: () => out,
    err: () => err,
  };
}

const FIXED_CLOCK = (): string => '2026-07-14T00:00:00.000Z';

// ── Shared fixtures (factory-built, never shared mutable module state) ────────

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

function makeAttribution(): Attribution {
  return {
    apiVersion: 'workspec.io/v1alpha1',
    kind: 'Attribution',
    metadata: { slug: 'attr' },
    spec: {
      dimensions: [{ id: 'product', label: 'Product', values: ['atrium', 'workspec'] }],
      rules: [
        {
          id: 'r1',
          name: 'VMs to atrium',
          match: { resourceType: 'Microsoft.Compute/virtualMachines' },
          assign: { product: 'atrium' },
        },
        { id: 'r2', name: 'Catch-all', match: {}, assign: { product: 'workspec' } },
      ],
    },
  };
}

function makeSpend(): Spend {
  return {
    apiVersion: 'workspec.io/v1alpha1',
    kind: 'Spend',
    metadata: { slug: 'spend-2026-07' },
    spec: {
      rows: [
        {
          resourceId: 'res-a',
          amount: 100,
          currency: 'NZD',
          period: '2026-07',
          serviceCategory: 'Virtual Machines',
        },
        {
          resourceId: 'res-b',
          amount: 50,
          currency: 'NZD',
          period: '2026-07',
          serviceCategory: 'Storage',
        },
      ],
    },
  };
}

describe('run: help + dispatch', () => {
  it('prints the help and exits zero for help, --help, -h, and no command', async () => {
    for (const argv of [[], ['help'], ['--help'], ['-h']]) {
      const cap = captureIO();
      const code = await run(argv, cap.io);
      expect(code).toBe(0);
      expect(cap.out()).toContain('workspec-cost');
      expect(cap.err()).toBe('');
    }
  });

  it('lists "serve" in the help but does NOT run it as the bare-command default', async () => {
    const cap = captureIO();
    const code = await run([], cap.io);
    expect(code).toBe(0);
    expect(cap.out()).toContain('serve');
    expect(cap.out()).not.toMatch(/Cost Studio · serving/);
  });

  it('errors, prints help, and exits 2 on an unknown command', async () => {
    const cap = captureIO();
    const code = await run(['frobnicate'], cap.io);
    expect(code).toBe(2);
    expect(cap.err()).toContain('unknown command "frobnicate"');
    expect(cap.out()).toContain('workspec-cost');
  });

  it('serve --help prints serve usage without binding a socket', async () => {
    const cap = captureIO();
    const code = await run(['serve', '--help'], cap.io);
    expect(code).toBe(0);
    expect(cap.out()).toContain('run the localhost Cost Studio host');
    expect(cap.err()).toBe('');
  });
});

describe('stocktake', () => {
  it('requires at least one --subscription', async () => {
    const cap = captureIO();
    const deps: RunDeps = { repository: createMemoryRepository() };
    const code = await run(['stocktake'], cap.io, deps);
    expect(code).toBe(2);
    expect(cap.err()).toContain('--subscription is required');
  });

  it('fetches inventory + spend via the provider and writes them (no drift line on a first run)', async () => {
    const repository = createMemoryRepository();
    const provider = createMemoryProvider({ inventory: makeInventory(), spend: [makeSpend()] });
    const cap = captureIO();
    const code = await run(
      ['stocktake', '--subscription', 'sub-1', '--period', '2026-07'],
      cap.io,
      { repository, provider },
    );
    expect(code).toBe(0);
    expect(cap.err()).not.toContain('drift');
    expect(cap.err()).toContain(
      'wrote .workspec/inventories/estate.yaml, .workspec/spends/estate-2026-07.yaml',
    );

    const inventories = await repository.listInventories();
    expect(inventories).toEqual([{ ref: '.workspec/inventories/estate.yaml', slug: 'estate' }]);
    const written = await repository.readInventory('.workspec/inventories/estate.yaml');
    expect(written.spec.resources.map((r) => r.id)).toEqual(['res-a', 'res-b']);
  });

  it('reports a drift summary before overwriting an existing inventory', async () => {
    const repository = createMemoryRepository();
    const provider = createMemoryProvider({ inventory: makeInventory(), spend: [makeSpend()] });
    const cap1 = captureIO();
    await run(['stocktake', '--subscription', 'sub-1', '--period', '2026-07'], cap1.io, {
      repository,
      provider,
    });

    // Simulate out-of-band drift: res-a disappears, res-b's tags change, res-c appears.
    provider.mutateLive('res-a', null);
    provider.mutateLive('res-b', { env: 'staging' });
    provider.addLiveResource({
      id: 'res-c',
      name: 'C',
      type: 'Microsoft.Network/loadBalancers',
      location: 'australiaeast',
      resourceGroup: 'rg-1',
      subscription: 'sub-1',
    });

    const cap2 = captureIO();
    const code = await run(
      ['stocktake', '--subscription', 'sub-1', '--period', '2026-07'],
      cap2.io,
      { repository, provider },
    );
    expect(code).toBe(0);
    expect(cap2.err()).toContain(
      'stocktake: 3 drifts: +1 appeared · −1 disappeared · ~1 tags changed\n',
    );
  });

  it('resolves (does not reject) to a clean usage error on an invalid --name', async () => {
    const cap = captureIO();
    const deps: RunDeps = {
      repository: createMemoryRepository(),
      provider: createMemoryProvider({ inventory: makeInventory(), spend: [makeSpend()] }),
    };
    const promise = run(
      ['stocktake', '--subscription', 's', '--name', 'Bad Name'],
      cap.io,
      deps,
    );
    await expect(promise).resolves.toBe(2);
    expect(cap.err()).toContain('stocktake: invalid --name "Bad Name"');
  });

  it('resolves (does not reject) to a clean usage error on a path-like --name', async () => {
    const cap = captureIO();
    const deps: RunDeps = {
      repository: createMemoryRepository(),
      provider: createMemoryProvider({ inventory: makeInventory(), spend: [makeSpend()] }),
    };
    const promise = run(
      ['stocktake', '--subscription', 's', '--name', '../evil'],
      cap.io,
      deps,
    );
    await expect(promise).resolves.toBe(2);
    expect(cap.err()).toContain('stocktake: invalid --name "../evil"');
  });

  it('notes when a previous inventory exists but fails to parse, and still overwrites it', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cost-studio-stocktake-'));
    try {
      await mkdir(join(dir, '.workspec', 'inventories'), { recursive: true });
      await writeFile(
        join(dir, '.workspec/inventories/estate.yaml'),
        ['apiVersion: workspec.io/v1alpha1', 'kind: Inventory', 'metadata: {}', 'spec: {}', ''].join(
          '\n',
        ),
      );
      const provider = createMemoryProvider({ inventory: makeInventory(), spend: [makeSpend()] });
      const cap = captureIO();
      const code = await run(
        ['stocktake', '--subscription', 'sub-1', '--period', '2026-07', '--dir', dir],
        cap.io,
        { repository: new FsRepository(dir), provider },
      );
      expect(code).toBe(0);
      expect(cap.err()).toContain(
        'stocktake: previous inventory at .workspec/inventories/estate.yaml could not be parsed — drift summary skipped',
      );
      expect(cap.err()).not.toContain('drifts:');
      expect(cap.err()).toContain('wrote .workspec/inventories/estate.yaml');

      const repository = new FsRepository(dir);
      const written = await repository.readInventory('.workspec/inventories/estate.yaml');
      expect(written.spec.resources.map((r) => r.id)).toEqual(['res-a', 'res-b']);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('validate', () => {
  it('prints a summary line and exits 0 with no artifacts', async () => {
    const cap = captureIO();
    const code = await run(['validate'], cap.io, { repository: createMemoryRepository() });
    expect(code).toBe(0);
    expect(cap.out()).toBe('');
    expect(cap.err()).toBe('validate: 0 artifact(s) OK\n');
  });

  it('reports schema errors with located diagnostics and exits 1', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cost-studio-validate-'));
    try {
      await mkdir(join(dir, '.workspec', 'inventories'), { recursive: true });
      await writeFile(
        join(dir, '.workspec', 'inventories', 'bad.yaml'),
        [
          '# yaml-language-server: $schema=x',
          'apiVersion: workspec.io/v1alpha1',
          'kind: Inventory',
          'metadata: {}',
          'spec:',
          '  asOf: "2026-07-01T00:00:00.000Z"',
          '  scope:',
          '    subscriptions: [sub-1]',
          '  resources:',
          '    - id: b',
          '      name: B',
          '      type: t',
          '      location: l',
          '      resourceGroup: rg',
          '      subscription: sub-1',
          '    - id: a', // out of order
          '      name: A',
          '      type: t',
          '      location: l',
          '      resourceGroup: rg',
          '      subscription: sub-1',
          '',
        ].join('\n'),
      );
      const cap = captureIO();
      const code = await run(['validate', '--dir', dir], cap.io, {
        repository: new FsRepository(dir),
      });
      expect(code).toBe(1);
      expect(cap.err()).toContain('error:');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('prints engine diagnostics as non-fatal warnings when inventory + attribution are both present', async () => {
    const inventory = makeInventory();
    const attribution = makeAttribution();
    const spend: Spend = {
      apiVersion: 'workspec.io/v1alpha1',
      kind: 'Spend',
      metadata: { slug: 'spend-with-orphan' },
      spec: {
        rows: [
          {
            resourceId: 'res-unknown',
            amount: 5,
            currency: 'NZD',
            period: '2026-07',
            serviceCategory: 'Misc',
          },
        ],
      },
    };
    const repository = createMemoryRepository({
      inventories: { '.workspec/inventories/i.yaml': inventory },
      attributions: { '.workspec/attributions/a.yaml': attribution },
      spends: { '.workspec/spends/s.yaml': spend },
    });
    const cap = captureIO();
    const code = await run(['validate'], cap.io, { repository });
    expect(code).toBe(0);
    expect(cap.err()).toContain('.workspec/attributions/a.yaml: warning: [orphan-spend-row]');
    expect(cap.err()).toContain('artifact(s) OK');
  });

  it('--json prints the diagnostics array to stdout, text diagnostics still on stderr', async () => {
    const cap = captureIO();
    const code = await run(['validate', '--json'], cap.io, { repository: createMemoryRepository() });
    expect(code).toBe(0);
    const parsed: unknown[] = JSON.parse(cap.out());
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(0);
    expect(cap.err()).toBe('validate: 0 artifact(s) OK\n');
  });

  it('--json reports a structured parse-error diagnostic on a schema violation', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cost-studio-validate-json-'));
    try {
      await mkdir(join(dir, '.workspec', 'inventories'), { recursive: true });
      await writeFile(
        join(dir, '.workspec', 'inventories', 'bad.yaml'),
        [
          '# yaml-language-server: $schema=x',
          'apiVersion: workspec.io/v1alpha1',
          'kind: Inventory',
          'metadata: {}',
          'spec:',
          '  asOf: "2026-07-01T00:00:00.000Z"',
          '  scope:',
          '    subscriptions: [sub-1]',
          '  resources:',
          '    - id: b',
          '      name: B',
          '      type: t',
          '      location: l',
          '      resourceGroup: rg',
          '      subscription: sub-1',
          '    - id: a', // out of order
          '      name: A',
          '      type: t',
          '      location: l',
          '      resourceGroup: rg',
          '      subscription: sub-1',
          '',
        ].join('\n'),
      );
      const cap = captureIO();
      const code = await run(['validate', '--dir', dir, '--json'], cap.io, {
        repository: new FsRepository(dir),
      });
      expect(code).toBe(1);
      const parsed = JSON.parse(cap.out()) as { severity: string; code: string }[];
      expect(parsed.length).toBeGreaterThan(0);
      expect(parsed.every((d) => d.severity === 'error' && d.code === 'parse-error')).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('--json reports engine diagnostics with their own code and warning severity', async () => {
    const inventory = makeInventory();
    const attribution = makeAttribution();
    const spend: Spend = {
      apiVersion: 'workspec.io/v1alpha1',
      kind: 'Spend',
      metadata: { slug: 'spend-with-orphan' },
      spec: {
        rows: [
          {
            resourceId: 'res-unknown',
            amount: 5,
            currency: 'NZD',
            period: '2026-07',
            serviceCategory: 'Misc',
          },
        ],
      },
    };
    const repository = createMemoryRepository({
      inventories: { '.workspec/inventories/i.yaml': inventory },
      attributions: { '.workspec/attributions/a.yaml': attribution },
      spends: { '.workspec/spends/s.yaml': spend },
    });
    const cap = captureIO();
    const code = await run(['validate', '--json'], cap.io, { repository });
    expect(code).toBe(0);
    const parsed = JSON.parse(cap.out()) as { severity: string; code: string; file: string }[];
    expect(parsed).toContainEqual(
      expect.objectContaining({ severity: 'warning', code: 'orphan-spend-row', file: '.workspec/attributions/a.yaml' }),
    );
  });
});

describe('report', () => {
  function seededRepository() {
    return createMemoryRepository({
      inventories: { '.workspec/inventories/i.yaml': makeInventory() },
      attributions: { '.workspec/attributions/a.yaml': makeAttribution() },
      spends: { '.workspec/spends/s.yaml': makeSpend() },
    });
  }

  it('errors with exit 2 when there is not exactly one inventory', async () => {
    const cap = captureIO();
    const code = await run(['report'], cap.io, { repository: createMemoryRepository() });
    expect(code).toBe(2);
    expect(cap.err()).toContain('expected exactly 1 inventory, found 0');
  });

  it('prints a coverage headline + rollup table by default', async () => {
    const cap = captureIO();
    const code = await run(['report'], cap.io, { repository: seededRepository() });
    expect(code).toBe(0);
    expect(cap.out()).toContain('coverage[product] 100.0% · $0/mo unattributed · 0 resources');
    expect(cap.out()).toContain('atrium');
    expect(cap.out()).toContain('workspec');
    expect(cap.out()).toContain('100');
    expect(cap.out()).toContain('50');
  });

  it('supports --format json with the raw rollup/coverage/totals subset', async () => {
    const cap = captureIO();
    const code = await run(['report', '--format', 'json'], cap.io, {
      repository: seededRepository(),
    });
    expect(code).toBe(0);
    const parsed = JSON.parse(cap.out()) as {
      rollup: { dimensionId: string };
      coverage: { isPrimary: boolean }[];
      totals: { inventorySpend: number };
    };
    expect(parsed.rollup.dimensionId).toBe('product');
    expect(parsed.coverage.some((c) => c.isPrimary)).toBe(true);
    expect(parsed.totals.inventorySpend).toBe(150);
  });

  it('supports --format csv', async () => {
    const cap = captureIO();
    const code = await run(['report', '--format', 'csv'], cap.io, {
      repository: seededRepository(),
    });
    expect(code).toBe(0);
    const lines = cap.out().trim().split('\n');
    expect(must(lines[0])).toBe('dimension,value,amount,share');
    expect(lines.slice(1).some((l) => l.startsWith('product,atrium,100,'))).toBe(true);
  });

  it('errors with exit 2 on an unknown --by dimension', async () => {
    const cap = captureIO();
    const code = await run(['report', '--by', 'bogus'], cap.io, {
      repository: seededRepository(),
    });
    expect(code).toBe(2);
    expect(cap.err()).toContain('unknown dimension "bogus"');
  });

  it('prints orphan-spend-row diagnostics as stderr warnings', async () => {
    const repository = createMemoryRepository({
      inventories: { '.workspec/inventories/i.yaml': makeInventory() },
      attributions: { '.workspec/attributions/a.yaml': makeAttribution() },
      spends: {
        '.workspec/spends/s.yaml': makeSpend(),
        '.workspec/spends/orphan.yaml': {
          apiVersion: 'workspec.io/v1alpha1',
          kind: 'Spend',
          metadata: { slug: 'orphan' },
          spec: {
            rows: [
              {
                resourceId: 'res-unknown',
                amount: 5,
                currency: 'NZD',
                period: '2026-07',
                serviceCategory: 'Misc',
              },
            ],
          },
        },
      },
    });
    const cap = captureIO();
    const code = await run(['report'], cap.io, { repository });
    expect(code).toBe(0);
    expect(cap.err()).toContain('report: warning: [orphan-spend-row]');
  });
});

describe('plan', () => {
  it('errors with exit 2 when there is not exactly one attribution', async () => {
    const cap = captureIO();
    const code = await run(['plan'], cap.io, {
      repository: createMemoryRepository({ inventories: { '.workspec/inventories/i.yaml': makeInventory() } }),
    });
    expect(code).toBe(2);
    expect(cap.err()).toContain('expected exactly 1 attribution, found 0');
  });

  it('uses the default fs-<kebab-case> tag mapping and writes the plan', async () => {
    const repository = createMemoryRepository({
      inventories: { '.workspec/inventories/i.yaml': makeInventory() },
      attributions: { '.workspec/attributions/a.yaml': makeAttribution() },
      spends: { '.workspec/spends/s.yaml': makeSpend() },
    });
    const cap = captureIO();
    const code = await run(['plan'], cap.io, { repository });
    expect(code).toBe(0);
    expect(cap.err()).toContain('plan: +2 add · ~0 change · −0 remove · 0 noop');

    const plans = await repository.listTagPlans();
    expect(plans).toHaveLength(1);
    const plan = await repository.readTagPlan(must(plans[0]).ref);
    expect(plan.spec.tagMapping).toEqual({ product: 'fs-product' });
    expect(must(plans[0]).ref).toBe('.workspec/tagplans/2026-07.yaml');
  });

  it('overrides the tag mapping via repeatable --map', async () => {
    const repository = createMemoryRepository({
      inventories: { '.workspec/inventories/i.yaml': makeInventory() },
      attributions: { '.workspec/attributions/a.yaml': makeAttribution() },
    });
    const cap = captureIO();
    const code = await run(['plan', '--map', 'product=custom-tag'], cap.io, { repository });
    expect(code).toBe(0);
    const plans = await repository.listTagPlans();
    const plan = await repository.readTagPlan(must(plans[0]).ref);
    expect(plan.spec.tagMapping).toEqual({ product: 'custom-tag' });
  });

  it('rejects an unknown dimension in --map with exit 2', async () => {
    const repository = createMemoryRepository({
      inventories: { '.workspec/inventories/i.yaml': makeInventory() },
      attributions: { '.workspec/attributions/a.yaml': makeAttribution() },
    });
    const cap = captureIO();
    const code = await run(['plan', '--map', 'bogus=fs-bogus'], cap.io, { repository });
    expect(code).toBe(2);
    expect(cap.err()).toContain('unknown dimension "bogus"');
  });

  it('resolves (does not reject) to a clean usage error on an invalid --out', async () => {
    const repository = createMemoryRepository({
      inventories: { '.workspec/inventories/i.yaml': makeInventory() },
      attributions: { '.workspec/attributions/a.yaml': makeAttribution() },
    });
    const cap = captureIO();
    const promise = run(['plan', '--out', 'Bad Name.tagplan.yaml'], cap.io, { repository });
    await expect(promise).resolves.toBe(2);
    expect(cap.err()).toContain('plan: invalid --out "Bad Name.tagplan.yaml"');
    expect(await repository.listTagPlans()).toHaveLength(0);
  });

  it('exits 1 when nothing is attributable (empty plan, zero resolutions)', async () => {
    const attribution: Attribution = {
      apiVersion: 'workspec.io/v1alpha1',
      kind: 'Attribution',
      metadata: { slug: 'attr-never' },
      spec: {
        dimensions: [{ id: 'product', label: 'Product', values: ['atrium'] }],
        rules: [
          { id: 'r1', name: 'Never matches', match: { resourceType: 'nonexistent' }, assign: { product: 'atrium' } },
        ],
      },
    };
    const repository = createMemoryRepository({
      inventories: { '.workspec/inventories/i.yaml': makeInventory() },
      attributions: { '.workspec/attributions/a.yaml': attribution },
    });
    const cap = captureIO();
    const code = await run(['plan'], cap.io, { repository });
    expect(code).toBe(1);
    expect(cap.err()).toContain('nothing to tag');
    expect(await repository.listTagPlans()).toHaveLength(0);
  });
});

describe('apply', () => {
  function seed() {
    const inventory = makeInventory();
    const tagPlan: TagPlan = {
      apiVersion: 'workspec.io/v1alpha1',
      kind: 'TagPlan',
      metadata: { slug: '2026-07' },
      spec: {
        baselineAsOf: inventory.spec.asOf,
        tagMapping: { product: 'fs-product' },
        entries: [
          { resourceId: 'res-a', tag: 'fs-product', current: null, desired: 'atrium', action: 'add' },
          { resourceId: 'res-b', tag: 'fs-product', current: null, desired: 'workspec', action: 'add' },
        ],
      },
    };
    const repository = createMemoryRepository({
      inventories: { '.workspec/inventories/estate.yaml': inventory },
      tagPlans: { '.workspec/tagplans/plan.yaml': tagPlan },
    });
    const provider = createMemoryProvider({ inventory, clock: FIXED_CLOCK });
    return { repository, provider };
  }

  it('applies a plan against the provider and reports per-entry results', async () => {
    const { repository, provider } = seed();
    const cap = captureIO();
    const code = await run(['apply', '.workspec/tagplans/plan.yaml'], cap.io, { repository, provider });
    expect(code).toBe(0);
    expect(cap.err()).toContain('✓ A fs-product add');
    expect(cap.err()).toContain('✓ B fs-product add');
    expect(cap.err()).toContain('apply: 2 applied · 0 noop · 0 failed');

    const after = await provider.fetchInventory({ subscriptions: ['sub-1'] });
    const resA = must(after.spec.resources.find((r) => r.id === 'res-a'));
    expect(resA.tags?.['fs-product']).toBe('atrium');
  });

  it('refuses (no writes) when live state has drifted from the plan baseline', async () => {
    const { repository, provider } = seed();
    provider.mutateLive('res-a', { 'hand-edited': 'true' });
    const cap = captureIO();
    const code = await run(['apply', '.workspec/tagplans/plan.yaml'], cap.io, { repository, provider });
    expect(code).toBe(1);
    expect(cap.err()).toContain('refusing');
    expect(cap.err()).toContain('re-stocktake and re-plan');

    const after = await provider.fetchInventory({ subscriptions: ['sub-1'] });
    const resA = must(after.spec.resources.find((r) => r.id === 'res-a'));
    expect(resA.tags?.['fs-product']).toBeUndefined();
  });

  it('mutates nothing with --dry-run', async () => {
    const { repository, provider } = seed();
    const cap = captureIO();
    const code = await run(['apply', '.workspec/tagplans/plan.yaml', '--dry-run'], cap.io, {
      repository,
      provider,
    });
    expect(code).toBe(0);
    expect(cap.err()).toContain('(dry run)');
    const after = await provider.fetchInventory({ subscriptions: ['sub-1'] });
    for (const resource of after.spec.resources) {
      expect(resource.tags?.['fs-product']).toBeUndefined();
    }
  });

  it('errors when no inventory matches the plan baseline', async () => {
    const { repository, provider } = seed();
    // Overwrite with an inventory whose asOf no longer matches the plan.
    const drifted = makeInventory();
    drifted.spec.asOf = '2099-01-01T00:00:00.000Z';
    await repository.writeInventory('.workspec/inventories/estate.yaml', drifted);
    const cap = captureIO();
    const code = await run(['apply', '.workspec/tagplans/plan.yaml'], cap.io, { repository, provider });
    expect(code).toBe(1);
    expect(cap.err()).toContain('no inventory found with asOf matching');
  });

  it('refuses (no writes, no verify) when two inventories share the plan baseline asOf', async () => {
    const inventory = makeInventory();
    const duplicate: Inventory = { ...inventory, metadata: { slug: 'duplicate' } };
    const tagPlan: TagPlan = {
      apiVersion: 'workspec.io/v1alpha1',
      kind: 'TagPlan',
      metadata: { slug: '2026-07' },
      spec: {
        baselineAsOf: inventory.spec.asOf,
        tagMapping: { product: 'fs-product' },
        entries: [
          { resourceId: 'res-a', tag: 'fs-product', current: null, desired: 'atrium', action: 'add' },
        ],
      },
    };
    const repository = createMemoryRepository({
      inventories: {
        '.workspec/inventories/estate.yaml': inventory,
        '.workspec/inventories/duplicate.yaml': duplicate,
      },
      tagPlans: { '.workspec/tagplans/plan.yaml': tagPlan },
    });
    const provider = createMemoryProvider({ inventory, clock: FIXED_CLOCK });
    const applyTagsSpy = vi.spyOn(provider, 'applyTags');
    const verifyBaselineSpy = vi.spyOn(provider, 'verifyBaseline');

    const cap = captureIO();
    const code = await run(['apply', '.workspec/tagplans/plan.yaml'], cap.io, { repository, provider });
    expect(code).toBe(1);
    expect(cap.err()).toContain(
      "apply: refusing — 2 inventories share the plan's baselineAsOf",
    );
    expect(cap.err()).toContain('.workspec/inventories/duplicate.yaml');
    expect(cap.err()).toContain('.workspec/inventories/estate.yaml');
    expect(cap.err()).toContain('keep exactly one or re-plan');
    expect(applyTagsSpy).not.toHaveBeenCalled();
    expect(verifyBaselineSpy).not.toHaveBeenCalled();
  });
});
