import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Attribution, Inventory, Spend, TagPlan } from '@workspec/cost-schema';
import { ArtifactValidationError, FsRepository, RefEscapesRootError } from './fs-repository.js';

/** Narrows a possibly-undefined lookup/index result, failing the test loudly if absent. */
function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('expected value to be defined');
  return value;
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
          id: 'res-1',
          name: 'Resource One',
          type: 'Microsoft.Compute/virtualMachines',
          location: 'australiaeast',
          resourceGroup: 'rg-1',
          subscription: 'sub-1',
          tags: { env: 'prod' },
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
        {
          resourceId: 'res-1',
          amount: 42,
          currency: 'NZD',
          period: '2026-07',
          serviceCategory: 'Virtual Machines',
        },
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
      dimensions: [{ id: 'product', label: 'Product', values: ['atrium'] }],
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
      entries: [],
    },
  };
}

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cost-studio-fsrepo-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('FsRepository discovery', () => {
  it('finds an inventory fixture under .workspec/inventories, deriving its slug from the filename', async () => {
    await mkdir(join(dir, '.workspec', 'inventories'), { recursive: true });
    await writeFile(
      join(dir, '.workspec', 'inventories', 'estate.yaml'),
      [
        '# yaml-language-server: $schema=x',
        'apiVersion: workspec.io/v1alpha1',
        'kind: Inventory',
        'metadata: {}',
        'spec:',
        '  name: "Prod estate"',
        '  asOf: "2026-07-01T00:00:00.000Z"',
        '  scope:',
        '    subscriptions: [sub-1]',
        '  resources: []',
        '',
      ].join('\n'),
    );
    const repo = new FsRepository(dir);
    const inventories = await repo.listInventories();
    expect(inventories).toEqual([
      { ref: '.workspec/inventories/estate.yaml', slug: 'estate', name: 'Prod estate' },
    ]);
  });

  it('lists each kind only from its own .workspec/<dir>, keyed by the filename slug', async () => {
    const repo = new FsRepository(dir);
    await repo.writeInventory('.workspec/inventories/estate.yaml', makeInventory());
    await repo.writeSpend('.workspec/spends/estate-2026-07.yaml', makeSpend());
    await repo.writeAttribution('.workspec/attributions/prod.yaml', makeAttribution());
    await repo.writeTagPlan('.workspec/tagplans/2026-07.yaml', makeTagPlan());

    expect(await repo.listInventories()).toEqual([
      { ref: '.workspec/inventories/estate.yaml', slug: 'estate' },
    ]);
    expect(await repo.listSpends()).toEqual([
      { ref: '.workspec/spends/estate-2026-07.yaml', slug: 'estate-2026-07' },
    ]);
    expect(await repo.listAttributions()).toEqual([
      { ref: '.workspec/attributions/prod.yaml', slug: 'prod' },
    ]);
    expect(await repo.listTagPlans()).toEqual([
      { ref: '.workspec/tagplans/2026-07.yaml', slug: '2026-07' },
    ]);
  });

  it('does not discover an artifact written outside its kind directory', async () => {
    const repo = new FsRepository(dir);
    await repo.writeInventory('stray.yaml', makeInventory());
    await repo.writeInventory('.workspec/spends/wrong-dir.yaml', makeInventory());
    expect(await repo.listInventories()).toEqual([]);
  });

  it('does not recurse into a subdirectory of a kind directory', async () => {
    const repo = new FsRepository(dir);
    await repo.writeInventory('.workspec/inventories/team-a/nested.yaml', makeInventory());
    expect(await repo.listInventories()).toEqual([]);
  });

  it('skips a file whose name is not a valid slug, without throwing', async () => {
    await mkdir(join(dir, '.workspec', 'inventories'), { recursive: true });
    await writeFile(join(dir, '.workspec', 'inventories', 'Not_A_Slug.yaml'), 'noise');
    const repo = new FsRepository(dir);
    expect(await repo.listInventories()).toEqual([]);
  });

  it('lists a file that fails to parse by its filename slug alone (no name)', async () => {
    await mkdir(join(dir, '.workspec', 'inventories'), { recursive: true });
    await writeFile(join(dir, '.workspec', 'inventories', 'broken.yaml'), 'not: [valid', 'utf8');
    const repo = new FsRepository(dir);
    expect(await repo.listInventories()).toEqual([
      { ref: '.workspec/inventories/broken.yaml', slug: 'broken' },
    ]);
  });

  it('an absent kind directory yields zero artifacts, not an error', async () => {
    const repo = new FsRepository(dir);
    expect(await repo.listInventories()).toEqual([]);
    expect(await repo.listSpends()).toEqual([]);
    expect(await repo.listAttributions()).toEqual([]);
    expect(await repo.listTagPlans()).toEqual([]);
  });
});

describe('FsRepository.resolve — ref containment (issue #52)', () => {
  it('still resolves a normal relative ref (no regression)', () => {
    const repo = new FsRepository(dir);
    expect(repo.resolve('.workspec/inventories/estate.yaml')).toBe(
      join(dir, '.workspec', 'inventories', 'estate.yaml'),
    );
  });

  it('rejects a POSIX absolute ref instead of trusting it unchanged', () => {
    const repo = new FsRepository(dir);
    expect(() => repo.resolve('/etc/passwd')).toThrow(RefEscapesRootError);
  });

  it('propagates the rejection through readInventory as a promise rejection', async () => {
    const repo = new FsRepository(dir);
    await expect(repo.readInventory('/etc/passwd')).rejects.toBeInstanceOf(RefEscapesRootError);
  });
});

describe('FsRepository read', () => {
  it('reads + validates a written inventory', async () => {
    const repo = new FsRepository(dir);
    await repo.writeInventory('.workspec/inventories/estate.yaml', makeInventory());
    const inventory = await repo.readInventory('.workspec/inventories/estate.yaml');
    expect(inventory.metadata.slug).toBe('estate');
    expect(must(inventory.spec.resources[0]).id).toBe('res-1');
  });

  it('throws ArtifactValidationError with located issues on an invalid file', async () => {
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
        '    - id: a', // out of order — fails the sort-order superRefine
        '      name: A',
        '      type: t',
        '      location: l',
        '      resourceGroup: rg',
        '      subscription: sub-1',
        '',
      ].join('\n'),
    );
    const repo = new FsRepository(dir);
    await expect(
      repo.readInventory('.workspec/inventories/bad.yaml'),
    ).rejects.toBeInstanceOf(ArtifactValidationError);
    try {
      await repo.readInventory('.workspec/inventories/bad.yaml');
    } catch (error) {
      const e = error as ArtifactValidationError;
      expect(must(e.issues[0]).path).toContain('spec.resources');
    }
  });
});

describe('FsRepository write', () => {
  it('writes a byte-stable inventory with the directive header', async () => {
    const repo = new FsRepository(dir);
    await repo.writeInventory('.workspec/inventories/estate.yaml', makeInventory());
    const written = await readFile(join(dir, '.workspec', 'inventories', 'estate.yaml'), 'utf8');
    expect(written.startsWith('# yaml-language-server: $schema=')).toBe(true);
    expect(written).toContain('id: res-1');
  });

  it('emits a fresh file under a not-yet-existing nested directory', async () => {
    const repo = new FsRepository(dir);
    await repo.writeInventory('custom/nested/new.yaml', makeInventory());
    const written = await readFile(join(dir, 'custom', 'nested', 'new.yaml'), 'utf8');
    expect(written.startsWith('# yaml-language-server: $schema=')).toBe(true);
    expect((await repo.readInventory('custom/nested/new.yaml')).metadata.slug).toBe('estate');
  });

  it('re-serializes deterministically on re-write (byte-stable)', async () => {
    const repo = new FsRepository(dir);
    await repo.writeInventory('.workspec/inventories/estate.yaml', makeInventory());
    const first = await readFile(join(dir, '.workspec', 'inventories', 'estate.yaml'), 'utf8');
    const read = await repo.readInventory('.workspec/inventories/estate.yaml');
    await repo.writeInventory('.workspec/inventories/estate.yaml', read);
    const second = await readFile(join(dir, '.workspec', 'inventories', 'estate.yaml'), 'utf8');
    expect(second).toBe(first);
  });

  it('rejects writes that fail Zod validation', async () => {
    const repo = new FsRepository(dir);
    const inventory = makeInventory();
    inventory.spec.resources.push({ ...must(inventory.spec.resources[0]) }); // duplicate id
    await expect(
      repo.writeInventory('.workspec/inventories/estate.yaml', inventory),
    ).rejects.toBeInstanceOf(ArtifactValidationError);
  });
});
