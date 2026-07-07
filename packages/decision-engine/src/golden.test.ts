import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Catalog, Decision } from '@workspec/decision-schema';
import { parseCatalogYaml, parseDecisionYaml } from '@workspec/decision-schema';
import { compute, recommend, validateRefs } from './index.js';
import type { DecisionCostResult } from './index.js';

// The golden snapshot of `compute(decision, catalog)` for the hosting-platform
// fixtures IS the cross-implementation conformance artifact. The explicit oracle
// assertions below pin the headline numbers so a regression is obvious even
// without reading the snapshot diff.

// src/ → engine/ → packages/ → <repo root>
const repoUrl = (rel: string): string => fileURLToPath(new URL(`../../../${rel}`, import.meta.url));
const read = (rel: string): string => readFileSync(repoUrl(rel), 'utf8');

let decision: Decision;
let catalog: Catalog;
let result: DecisionCostResult;

beforeAll(() => {
  const decisionRes = parseDecisionYaml(
    read('examples/hosting-platform/hosting-platform.decision.yaml'),
  );
  const catalogRes = parseCatalogYaml(read('examples/hosting-platform/platform.catalog.yaml'));
  if (!decisionRes.ok) throw new Error('decision fixture failed to parse');
  if (!catalogRes.ok) throw new Error('catalog fixture failed to parse');
  decision = decisionRes.data;
  catalog = catalogRes.data;
  result = compute(decision, catalog);
});

describe('hosting-platform golden numbers (base = default lever state)', () => {
  // option | dev | test | prod | monthly | annual | headroom | complete
  const oracle = [
    {
      id: 'aks',
      dev: 792,
      test: 867,
      prod: 2869.048,
      monthly: 4528.048,
      annual: 54336.576,
      headroom: 950,
      complete: true,
    },
    {
      id: 'appsvc',
      dev: 187.2,
      test: 440.2,
      prod: 714.6,
      monthly: 1342,
      annual: 16104,
      headroom: 124,
      complete: true,
    },
    {
      id: 'ase',
      dev: undefined,
      test: 1575,
      prod: 2900,
      monthly: 4475,
      annual: 53700,
      headroom: 1105,
      complete: true,
    },
    {
      id: 'aca',
      dev: 185,
      test: 220,
      prod: 775,
      monthly: 1180,
      annual: 14160,
      headroom: 0,
      complete: false,
    },
  ] as const;

  for (const row of oracle) {
    it(`${row.id} matches the oracle table exactly`, () => {
      const cost = result.byOption[row.id];
      expect(cost, `missing cost for option ${row.id}`).toBeDefined();
      if (cost === undefined) return;

      // Per-env (dev is absent for ase).
      expect(cost.perEnv['dev']).toBe(row.dev);
      expect(cost.perEnv['test']).toBe(row.test);
      expect(cost.perEnv['prod']).toBe(row.prod);

      expect(cost.monthly).toBe(row.monthly);
      expect(cost.annual).toBe(row.annual);
      expect(cost.headroom).toBe(row.headroom);
      expect(cost.complete).toBe(row.complete);
    });
  }

  it('ase is costed for test + prod only (no dev)', () => {
    const ase = result.byOption['ase'];
    expect(ase?.activeEnvs).toEqual(['test', 'prod']);
    expect(ase?.perEnv['dev']).toBeUndefined();
  });

  it('picks appsvc as the cheapest complete option', () => {
    expect(result.cheapestId).toBe('appsvc');
  });

  it('recommends aks (highest weighted fit minus normalised cost)', () => {
    expect(recommend(result, decision)).toBe('aks');
  });

  it('reports no dangling catalog references', () => {
    expect(validateRefs(decision, catalog)).toEqual([]);
  });
});

describe('hosting-platform conformance snapshot', () => {
  it('matches the committed golden snapshot', () => {
    // The full result — per-env, per-line, headroom, roll-up — is the
    // cross-implementation conformance artifact.
    expect(result).toMatchSnapshot();
  });
});
