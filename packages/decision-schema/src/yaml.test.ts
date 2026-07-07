import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseCatalogYaml, parseDecisionYaml } from './index.js';
import { invalidCases } from './invalid-fixtures.expected.js';

// src/ → schema/ → packages/ → <repo root>
const repoUrl = (rel: string): string => fileURLToPath(new URL(`../../../${rel}`, import.meta.url));
// src/ → schema/ → test/fixtures/invalid
const invalidUrl = (file: string): string =>
  fileURLToPath(new URL(`../test/fixtures/invalid/${file}`, import.meta.url));

const read = (path: string): string => readFileSync(path, 'utf8');

/** Narrows a possibly-undefined lookup/index result, failing the test loudly if absent. */
function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('expected value to be defined');
  return value;
}

describe('valid hosting-platform fixtures', () => {
  it('parses the catalog fixture', () => {
    const res = parseCatalogYaml(read(repoUrl('examples/hosting-platform/platform.catalog.yaml')));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.metadata.id).toBe('platform');
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

  it('parses the decision fixture with all four options', () => {
    const res = parseDecisionYaml(
      read(repoUrl('examples/hosting-platform/hosting-platform.decision.yaml')),
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.spec.options.map((o) => o.id)).toEqual(['aks', 'appsvc', 'ase', 'aca']);
      // Default lever state preserved from the prototype.
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
      expect(leverState('ase')).toEqual({ scheduleNonProd: false });
      expect(leverState('aca')).toEqual({ scheduleNonProd: true });
      // ACA is still being modelled.
      expect(res.data.spec.options.find((o) => o.id === 'aca')?.complete).toBe(false);
    }
  });

  it('binds the decision to its catalog by relative path', () => {
    const res = parseDecisionYaml(
      read(repoUrl('examples/hosting-platform/hosting-platform.decision.yaml')),
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.spec.catalog).toBe('./platform.catalog.yaml');
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
