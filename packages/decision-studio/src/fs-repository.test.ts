import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ArtifactValidationError, FsRepository, RefEscapesRootError } from './fs-repository.js';

// packages/decision-studio/src → repo root is three levels up.
const repoPath = (rel: string): string =>
  fileURLToPath(new URL(`../../../${rel}`, import.meta.url));
const HOSTING_DIR = repoPath('examples/hosting-platform');
const DECISION_REF = '.workspec/decisions/hosting-platform.yaml';
const CATALOG_REF = '.workspec/catalogs/platform.yaml';

/** Narrows a possibly-undefined lookup/index result, failing the test loudly if absent. */
function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('expected value to be defined');
  return value;
}

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'ds-fsrepo-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('FsRepository discovery', () => {
  it('finds the hosting-platform decision + catalog fixtures with filename-derived slugs', async () => {
    const repo = new FsRepository(HOSTING_DIR);
    const decisions = await repo.listDecisions();
    const catalogs = await repo.listCatalogs();

    expect(decisions).toEqual([
      {
        ref: DECISION_REF,
        slug: 'hosting-platform',
        title: 'Hosting platform for the data and delivery services',
      },
    ]);
    expect(catalogs).toEqual([
      { ref: CATALOG_REF, slug: 'platform', title: 'Hosting platform catalog' },
    ]);
  });

  it('does not discover an artifact written outside its kind directory', async () => {
    const repo = new FsRepository(dir);
    const hosting = new FsRepository(HOSTING_DIR);
    const decision = await hosting.readDecision(DECISION_REF);
    await repo.writeDecision('stray.yaml', decision);
    await repo.writeDecision('.workspec/catalogs/wrong-dir.yaml', decision);
    expect(await repo.listDecisions()).toEqual([]);
  });

  it('does not recurse into a subdirectory of a kind directory', async () => {
    const repo = new FsRepository(dir);
    const hosting = new FsRepository(HOSTING_DIR);
    const decision = await hosting.readDecision(DECISION_REF);
    await repo.writeDecision('.workspec/decisions/team-a/nested.yaml', decision);
    expect(await repo.listDecisions()).toEqual([]);
  });

  it('an absent kind directory yields zero artifacts, not an error', async () => {
    const repo = new FsRepository(dir);
    expect(await repo.listDecisions()).toEqual([]);
    expect(await repo.listCatalogs()).toEqual([]);
  });
});

describe('FsRepository.resolve — ref containment (issue #52)', () => {
  it('still resolves a normal relative ref (no regression)', () => {
    const repo = new FsRepository(dir);
    expect(repo.resolve('.workspec/decisions/a.yaml')).toBe(
      join(dir, '.workspec', 'decisions', 'a.yaml'),
    );
  });

  it('rejects a POSIX absolute ref instead of trusting it unchanged', () => {
    const repo = new FsRepository(dir);
    expect(() => repo.resolve('/etc/passwd')).toThrow(RefEscapesRootError);
  });

  it('propagates the rejection through readDecision as a promise rejection', async () => {
    const repo = new FsRepository(dir);
    await expect(repo.readDecision('/etc/passwd')).rejects.toBeInstanceOf(RefEscapesRootError);
  });
});

describe('FsRepository read', () => {
  it('reads + validates the hosting-platform fixtures', async () => {
    const repo = new FsRepository(HOSTING_DIR);
    const decision = await repo.readDecision(DECISION_REF);
    const catalog = await repo.readCatalog(CATALOG_REF);
    expect(decision.metadata.slug).toBe('hosting-platform');
    expect(catalog.metadata.slug).toBe('platform');
  });

  it('throws ArtifactValidationError with located issues on an invalid file', async () => {
    await writeFile(
      join(dir, 'bad.catalog.yaml'),
      [
        '# yaml-language-server: $schema=x',
        'apiVersion: workspec.io/v1alpha1',
        'kind: Catalog',
        'metadata: {}',
        'spec:',
        '  currency: NZD',
        '  asOf: "2026-07-01"',
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
      expect(must(e.issues[0]).path).toBe('spec.schedules.0.pct');
      expect(must(e.issues[0]).line).toBe(16);
    }
  });
});

describe('FsRepository write (round-trip + comment preservation)', () => {
  it('round-trips the hosting-platform decision preserving data and comments', async () => {
    // Seed the temp dir with the real hosting-platform fixtures.
    const decisionText = await readFile(join(HOSTING_DIR, DECISION_REF), 'utf8');
    const catalogText = await readFile(join(HOSTING_DIR, CATALOG_REF), 'utf8');
    await mkdir(dirname(join(dir, DECISION_REF)), { recursive: true });
    await mkdir(dirname(join(dir, CATALOG_REF)), { recursive: true });
    await writeFile(join(dir, DECISION_REF), decisionText);
    await writeFile(join(dir, CATALOG_REF), catalogText);

    const repo = new FsRepository(dir);
    const before = await repo.readDecision(DECISION_REF);
    await repo.writeDecision(DECISION_REF, before);

    const written = await readFile(join(dir, DECISION_REF), 'utf8');
    // Directive header present exactly once.
    expect(written.match(/yaml-language-server/g)).toHaveLength(1);
    expect(written.startsWith('# yaml-language-server: $schema=')).toBe(true);
    // Section-separator comments survive.
    expect(written).toContain('# ── AKS');
    // The authored inline lever comment survives.
    expect(written).toContain('# Matches the flat `api` line');

    // Data round-trips exactly.
    const after = await repo.readDecision(DECISION_REF);
    expect(after).toEqual(before);
  });

  it('preserves the catalog section comments on round-trip', async () => {
    const catalogText = await readFile(join(HOSTING_DIR, CATALOG_REF), 'utf8');
    await mkdir(dirname(join(dir, CATALOG_REF)), { recursive: true });
    await writeFile(join(dir, CATALOG_REF), catalogText);
    const repo = new FsRepository(dir);
    const before = await repo.readCatalog(CATALOG_REF);
    await repo.writeCatalog(CATALOG_REF, before);
    const written = await readFile(join(dir, CATALOG_REF), 'utf8');
    expect(written).toContain('# Pricing modes are multipliers');
    expect(written).toContain('# SKUs are priced');
    expect(await repo.readCatalog(CATALOG_REF)).toEqual(before);
  });

  it('patches a changed value while keeping surrounding comments', async () => {
    const catalogText = await readFile(join(HOSTING_DIR, CATALOG_REF), 'utf8');
    await mkdir(dirname(join(dir, CATALOG_REF)), { recursive: true });
    await writeFile(join(dir, CATALOG_REF), catalogText);
    const repo = new FsRepository(dir);
    const catalog = await repo.readCatalog(CATALOG_REF);
    // Bump a SKU price and write back.
    must(catalog.spec.skus[0]).price = 999;
    await repo.writeCatalog(CATALOG_REF, catalog);

    const reread = await repo.readCatalog(CATALOG_REF);
    expect(must(reread.spec.skus[0]).price).toBe(999);
    const written = await readFile(join(dir, CATALOG_REF), 'utf8');
    expect(written).toContain('# Pricing modes are multipliers'); // comment survived the edit
    expect(written).toContain('999');
  });

  it('emits a fresh file (with directive) when none exists', async () => {
    const repo = new FsRepository(dir);
    // Read the hosting-platform catalog from the example dir, write it to a brand-new ref.
    const exampleRepo = new FsRepository(HOSTING_DIR);
    const catalog = await exampleRepo.readCatalog(CATALOG_REF);
    await repo.writeCatalog('.workspec/catalogs/new.yaml', catalog);
    const written = await readFile(join(dir, '.workspec', 'catalogs', 'new.yaml'), 'utf8');
    expect(written.startsWith('# yaml-language-server: $schema=')).toBe(true);
    expect(await repo.readCatalog('.workspec/catalogs/new.yaml')).toEqual(catalog);
  });

  it('rejects writes that fail Zod validation', async () => {
    const repo = new FsRepository(dir);
    const catalog = await new FsRepository(HOSTING_DIR).readCatalog(CATALOG_REF);
    must(catalog.spec.schedules[0]).pct = 1.5; // out of range
    await expect(repo.writeCatalog(CATALOG_REF, catalog)).rejects.toBeInstanceOf(
      ArtifactValidationError,
    );
  });
});
