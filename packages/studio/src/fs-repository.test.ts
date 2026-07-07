import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ArtifactValidationError, FsRepository } from './fs-repository.js';

// packages/studio/src → repo root is three levels up.
const repoPath = (rel: string): string =>
  fileURLToPath(new URL(`../../../${rel}`, import.meta.url));
const HOSTING_DIR = repoPath('examples/hosting-platform');

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'ds-fsrepo-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('FsRepository discovery', () => {
  it('finds the hosting-platform decision + catalog fixtures with metadata ids', async () => {
    const repo = new FsRepository(HOSTING_DIR);
    const decisions = await repo.listDecisions();
    const catalogs = await repo.listCatalogs();

    expect(decisions).toEqual([
      {
        ref: 'hosting-platform.decision.yaml',
        id: 'dec-hosting',
        title: 'Hosting platform for the data and delivery services',
      },
    ]);
    expect(catalogs).toEqual([
      { ref: 'platform.catalog.yaml', id: 'platform', title: 'Hosting platform catalog' },
    ]);
  });

  it('walks nested directories and skips node_modules/dist/.git', async () => {
    await mkdir(join(dir, 'a', 'b'), { recursive: true });
    await mkdir(join(dir, 'node_modules', 'pkg'), { recursive: true });
    await mkdir(join(dir, 'dist'), { recursive: true });
    await writeFile(
      join(dir, 'a', 'b', 'nested.decision.yaml'),
      await readFile(join(HOSTING_DIR, 'hosting-platform.decision.yaml')),
    );
    await writeFile(join(dir, 'node_modules', 'pkg', 'ignored.decision.yaml'), 'noise');
    await writeFile(join(dir, 'dist', 'ignored.catalog.yaml'), 'noise');

    const repo = new FsRepository(dir);
    const decisions = await repo.listDecisions();
    expect(decisions.map((d) => d.ref)).toEqual(['a/b/nested.decision.yaml']);
    expect(await repo.listCatalogs()).toEqual([]);
  });
});

describe('FsRepository read', () => {
  it('reads + validates the hosting-platform fixtures', async () => {
    const repo = new FsRepository(HOSTING_DIR);
    const decision = await repo.readDecision('hosting-platform.decision.yaml');
    const catalog = await repo.readCatalog('platform.catalog.yaml');
    expect(decision.metadata.id).toBe('dec-hosting');
    expect(catalog.metadata.id).toBe('platform');
  });

  it('throws ArtifactValidationError with located issues on an invalid file', async () => {
    await writeFile(
      join(dir, 'bad.catalog.yaml'),
      [
        '# yaml-language-server: $schema=x',
        'apiVersion: workspec.io/v1alpha1',
        'kind: Catalog',
        'metadata:',
        '  id: c',
        '  currency: NZD',
        '  asOf: "2026-07-01"',
        'spec:',
        '  pricingModes:',
        '    - id: payg',
        '      label: "PAYG"',
        '      mult: 1.0',
        '      committed: false',
        '  schedules:',
        '    - id: always',
        '      label: "24x7"',
        '      pct: 1.5', // out of range
        '  skus:',
        '    - id: d4s_v5',
        '      label: "D4"',
        '      family: "F"',
        '      price: 1',
        '',
      ].join('\n'),
    );
    const repo = new FsRepository(dir);
    await expect(repo.readCatalog('bad.catalog.yaml')).rejects.toBeInstanceOf(
      ArtifactValidationError,
    );
    try {
      await repo.readCatalog('bad.catalog.yaml');
    } catch (error) {
      const e = error as ArtifactValidationError;
      expect(e.issues[0]!.path).toBe('spec.schedules.0.pct');
      expect(e.issues[0]!.line).toBe(17);
    }
  });
});

describe('FsRepository write (round-trip + comment preservation)', () => {
  it('round-trips the hosting-platform decision preserving data and comments', async () => {
    // Seed the temp dir with the real hosting-platform fixtures.
    const decisionText = await readFile(
      join(HOSTING_DIR, 'hosting-platform.decision.yaml'),
      'utf8',
    );
    const catalogText = await readFile(join(HOSTING_DIR, 'platform.catalog.yaml'), 'utf8');
    await writeFile(join(dir, 'hosting-platform.decision.yaml'), decisionText);
    await writeFile(join(dir, 'platform.catalog.yaml'), catalogText);

    const repo = new FsRepository(dir);
    const before = await repo.readDecision('hosting-platform.decision.yaml');
    await repo.writeDecision('hosting-platform.decision.yaml', before);

    const written = await readFile(join(dir, 'hosting-platform.decision.yaml'), 'utf8');
    // Directive header present exactly once.
    expect(written.match(/yaml-language-server/g)).toHaveLength(1);
    expect(written.startsWith('# yaml-language-server: $schema=')).toBe(true);
    // Section-separator comments survive.
    expect(written).toContain('# ── AKS');
    // The authored inline lever comment survives.
    expect(written).toContain('# Matches the flat `api` line');

    // Data round-trips exactly.
    const after = await repo.readDecision('hosting-platform.decision.yaml');
    expect(after).toEqual(before);
  });

  it('preserves the catalog section comments on round-trip', async () => {
    const catalogText = await readFile(join(HOSTING_DIR, 'platform.catalog.yaml'), 'utf8');
    await writeFile(join(dir, 'platform.catalog.yaml'), catalogText);
    const repo = new FsRepository(dir);
    const before = await repo.readCatalog('platform.catalog.yaml');
    await repo.writeCatalog('platform.catalog.yaml', before);
    const written = await readFile(join(dir, 'platform.catalog.yaml'), 'utf8');
    expect(written).toContain('# Pricing modes are multipliers');
    expect(written).toContain('# SKUs are priced');
    expect(await repo.readCatalog('platform.catalog.yaml')).toEqual(before);
  });

  it('patches a changed value while keeping surrounding comments', async () => {
    const catalogText = await readFile(join(HOSTING_DIR, 'platform.catalog.yaml'), 'utf8');
    await writeFile(join(dir, 'platform.catalog.yaml'), catalogText);
    const repo = new FsRepository(dir);
    const catalog = await repo.readCatalog('platform.catalog.yaml');
    // Bump a SKU price and write back.
    catalog.spec.skus[0]!.price = 999;
    await repo.writeCatalog('platform.catalog.yaml', catalog);

    const reread = await repo.readCatalog('platform.catalog.yaml');
    expect(reread.spec.skus[0]!.price).toBe(999);
    const written = await readFile(join(dir, 'platform.catalog.yaml'), 'utf8');
    expect(written).toContain('# Pricing modes are multipliers'); // comment survived the edit
    expect(written).toContain('999');
  });

  it('emits a fresh file (with directive) when none exists', async () => {
    const repo = new FsRepository(dir);
    // Read the hosting-platform catalog from the example dir, write it to a brand-new ref.
    const exampleRepo = new FsRepository(HOSTING_DIR);
    const catalog = await exampleRepo.readCatalog('platform.catalog.yaml');
    await repo.writeCatalog('nested/new.catalog.yaml', catalog);
    const written = await readFile(join(dir, 'nested', 'new.catalog.yaml'), 'utf8');
    expect(written.startsWith('# yaml-language-server: $schema=')).toBe(true);
    expect(await repo.readCatalog('nested/new.catalog.yaml')).toEqual(catalog);
  });

  it('rejects writes that fail Zod validation', async () => {
    const repo = new FsRepository(dir);
    const catalog = await new FsRepository(HOSTING_DIR).readCatalog('platform.catalog.yaml');
    catalog.spec.schedules[0]!.pct = 1.5; // out of range
    await expect(repo.writeCatalog('platform.catalog.yaml', catalog)).rejects.toBeInstanceOf(
      ArtifactValidationError,
    );
  });
});
