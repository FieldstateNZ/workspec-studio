import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseCatalogYaml, parseDecisionYaml } from './index.js';
import { invalidCases } from './invalid-fixtures.expected.js';

// src/ → schema/ → test/fixtures/valid
const validUrl = (file: string): string =>
  fileURLToPath(new URL(`../test/fixtures/valid/${file}`, import.meta.url));
// src/ → schema/ → test/fixtures/invalid
const invalidUrl = (file: string): string =>
  fileURLToPath(new URL(`../test/fixtures/invalid/${file}`, import.meta.url));

const read = (path: string): string => readFileSync(path, 'utf8');

/** Narrows a possibly-undefined lookup/index result, failing the test loudly if absent. */
function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('expected value to be defined');
  return value;
}

// These fixtures live under this package's own `test/fixtures/valid/` (not
// `examples/`, which still holds the pre-migration shape until the
// downstream examples/apps slice republishes against the new envelope) so
// the package's own test suite always exercises the current schema.
describe('valid hosting-platform fixtures', () => {
  it('parses the catalog fixture', () => {
    const res = parseCatalogYaml(read(validUrl('platform.catalog.yaml')));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.metadata.slug).toBe('platform');
      expect(res.data.spec.pricingModes.map((m) => m.id)).toEqual([
        'payg',
        'sp1',
        'sp3',
        'ri1',
        'ri3',
        'spot',
      ]);
      expect(res.data.spec.skus).toHaveLength(9);
    }
  });

  it('parses the decision fixture with all three options', () => {
    const res = parseDecisionYaml(read(validUrl('hosting-platform.decision.yaml')));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.spec.options.map((o) => o.id)).toEqual(['aks', 'appsvc', 'aca']);
      // Default lever state.
      const leverState = (id: string): Record<string, boolean> =>
        Object.fromEntries(
          (res.data.spec.options.find((o) => o.id === id)?.levers ?? []).map((l) => [
            l.id,
            l.enabled,
          ]),
        );
      expect(leverState('aks')).toEqual({
        reserveProd: false,
        scheduleNonProd: true,
        spotBatch: true,
      });
      expect(leverState('appsvc')).toEqual({
        reserveProd: false,
        scheduleNonProd: true,
      });
      // ACA is still being modelled.
      expect(res.data.spec.options.find((o) => o.id === 'aca')?.complete).toBe(false);
    }
  });

  it('binds the decision to its catalog by slug ref', () => {
    const res = parseDecisionYaml(read(validUrl('hosting-platform.decision.yaml')));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.spec.catalog).toBe('platform');
  });

  it('carries a supersedes slug ref', () => {
    const res = parseDecisionYaml(read(validUrl('hosting-platform.decision.yaml')));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.spec.supersedes).toBe('legacy-hosting');
  });
});

describe('invalid fixture battery', () => {
  for (const c of invalidCases) {
    it(`${c.file} fails at ${c.path} (line ${c.line})`, () => {
      const text = read(invalidUrl(c.file));
      const res = c.kind === 'catalog' ? parseCatalogYaml(text) : parseDecisionYaml(text);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        const match = must(res.errors.find((e) => e.path === c.path));
        expect(match.line).toBe(c.line);
        expect(match.col).toBeGreaterThan(0);
      }
    });
  }
});

describe('YAML syntax errors', () => {
  it('reports a document-level error with a line, not a throw', () => {
    // Bad indentation / structure that the YAML parser itself rejects.
    const res = parseDecisionYaml('kind: Decision\n  bad: : :\n');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors.length).toBeGreaterThan(0);
      expect(must(res.errors[0]).line).toBeGreaterThan(0);
    }
  });
});
