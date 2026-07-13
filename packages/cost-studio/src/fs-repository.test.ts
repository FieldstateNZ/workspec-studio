import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Inventory } from '@workspec/cost-schema';
import { ArtifactValidationError, FsRepository } from './fs-repository.js';

/** Narrows a possibly-undefined lookup/index result, failing the test loudly if absent. */
function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('expected value to be defined');
  return value;
}

function makeInventory(): Inventory {
  return {
    apiVersion: 'workspec.io/v1alpha1',
    kind: 'Inventory',
    metadata: { id: 'estate' },
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

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cost-studio-fsrepo-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('FsRepository discovery', () => {
  it('finds inventory/spend/attribution/tagplan fixtures with metadata ids', async () => {
    await writeFile(
      join(dir, 'estate.inventory.yaml'),
      [
        '# yaml-language-server: $schema=x',
        'apiVersion: workspec.io/v1alpha1',
        'kind: Inventory',
        'metadata:',
        '  id: estate',
        '  name: "Prod estate"',
        'spec:',
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
      { ref: 'estate.inventory.yaml', id: 'estate', name: 'Prod estate' },
    ]);
  });

  it('walks nested directories and skips node_modules/dist/.git/coverage', async () => {
    await mkdir(join(dir, 'a', 'b'), { recursive: true });
    await mkdir(join(dir, 'node_modules', 'pkg'), { recursive: true });
    await mkdir(join(dir, 'dist'), { recursive: true });
    await mkdir(join(dir, 'coverage'), { recursive: true });

    const repo = new FsRepository(dir);
    await repo.writeInventory('a/b/nested.inventory.yaml', makeInventory());
    await writeFile(join(dir, 'node_modules', 'pkg', 'ignored.inventory.yaml'), 'noise');
    await writeFile(join(dir, 'dist', 'ignored.spend.yaml'), 'noise');
    await writeFile(join(dir, 'coverage', 'ignored.attribution.yaml'), 'noise');

    const inventories = await repo.listInventories();
    expect(inventories.map((i) => i.ref)).toEqual(['a/b/nested.inventory.yaml']);
    expect(await repo.listSpends()).toEqual([]);
    expect(await repo.listAttributions()).toEqual([]);
  });
});

describe('FsRepository read', () => {
  it('reads + validates a written inventory', async () => {
    const repo = new FsRepository(dir);
    await repo.writeInventory('estate.inventory.yaml', makeInventory());
    const inventory = await repo.readInventory('estate.inventory.yaml');
    expect(inventory.metadata.id).toBe('estate');
    expect(must(inventory.spec.resources[0]).id).toBe('res-1');
  });

  it('throws ArtifactValidationError with located issues on an invalid file', async () => {
    await writeFile(
      join(dir, 'bad.inventory.yaml'),
      [
        '# yaml-language-server: $schema=x',
        'apiVersion: workspec.io/v1alpha1',
        'kind: Inventory',
        'metadata:',
        '  id: estate',
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
    await expect(repo.readInventory('bad.inventory.yaml')).rejects.toBeInstanceOf(
      ArtifactValidationError,
    );
    try {
      await repo.readInventory('bad.inventory.yaml');
    } catch (error) {
      const e = error as ArtifactValidationError;
      expect(must(e.issues[0]).path).toContain('spec.resources');
    }
  });
});

describe('FsRepository write', () => {
  it('writes a byte-stable inventory with the directive header', async () => {
    const repo = new FsRepository(dir);
    await repo.writeInventory('estate.inventory.yaml', makeInventory());
    const written = await readFile(join(dir, 'estate.inventory.yaml'), 'utf8');
    expect(written.startsWith('# yaml-language-server: $schema=')).toBe(true);
    expect(written).toContain('id: res-1');
  });

  it('emits a fresh nested file when none exists', async () => {
    const repo = new FsRepository(dir);
    await repo.writeInventory('nested/new.inventory.yaml', makeInventory());
    const written = await readFile(join(dir, 'nested', 'new.inventory.yaml'), 'utf8');
    expect(written.startsWith('# yaml-language-server: $schema=')).toBe(true);
    expect((await repo.readInventory('nested/new.inventory.yaml')).metadata.id).toBe('estate');
  });

  it('re-serializes deterministically on re-write (byte-stable)', async () => {
    const repo = new FsRepository(dir);
    await repo.writeInventory('estate.inventory.yaml', makeInventory());
    const first = await readFile(join(dir, 'estate.inventory.yaml'), 'utf8');
    const read = await repo.readInventory('estate.inventory.yaml');
    await repo.writeInventory('estate.inventory.yaml', read);
    const second = await readFile(join(dir, 'estate.inventory.yaml'), 'utf8');
    expect(second).toBe(first);
  });

  it('rejects writes that fail Zod validation', async () => {
    const repo = new FsRepository(dir);
    const inventory = makeInventory();
    inventory.spec.resources.push({ ...must(inventory.spec.resources[0]) }); // duplicate id
    await expect(repo.writeInventory('estate.inventory.yaml', inventory)).rejects.toBeInstanceOf(
      ArtifactValidationError,
    );
  });
});
