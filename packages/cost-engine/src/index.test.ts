import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, TagPlanArtifact } from '@workspec/cost-schema';
import type {
  Attribution,
  DimensionType,
  Inventory,
  InventoryResourceType,
  RuleType,
  Spend,
  SpendRowType,
} from '@workspec/cost-schema';
import {
  attribute,
  buildTagPlan,
  computeCoverage,
  COST_ENGINE_PACKAGE,
  crossTab,
  ENGINE_TARGET_SCHEMA,
  globToRegExp,
  joinSpend,
  matchRule,
  plan,
  resolveAttribution,
  rollupBy,
  serializeSplitValue,
} from './index.js';
import type { DimensionAssignment, ResourceResolution } from './index.js';

// ── Small synthetic fixtures (not the golden demo estate — that lives in
// golden.test.ts / property.test.ts). Each test builds only what it needs. ──

function resource(overrides: Partial<InventoryResourceType> & Pick<InventoryResourceType, 'id' | 'name'>): InventoryResourceType {
  return {
    type: 'Test.Type/thing',
    location: 'australiaeast',
    resourceGroup: 'rg-test',
    subscription: 'sub-1',
    ...overrides,
  };
}

function inventoryOf(resources: InventoryResourceType[]): Inventory {
  return {
    apiVersion: 'workspec.io/v1alpha1',
    kind: 'Inventory',
    metadata: { slug: 'test' },
    spec: {
      asOf: '2026-07-07T00:00:00Z',
      scope: { subscriptions: ['sub-1'] },
      resources,
    },
  };
}

function attributionOf(dimensions: DimensionType[], rules: RuleType[], overrides?: Attribution['spec']['overrides']): Attribution {
  return {
    apiVersion: 'workspec.io/v1alpha1',
    kind: 'Attribution',
    metadata: { slug: 'test' },
    spec: { dimensions, rules, ...(overrides !== undefined ? { overrides } : {}) },
  };
}

function spendOf(rows: SpendRowType[]): Spend {
  return { apiVersion: 'workspec.io/v1alpha1', kind: 'Spend', metadata: { slug: 'test' }, spec: { rows } };
}

const DIM_PRODUCT: DimensionType = { id: 'product', label: 'Product', values: ['a', 'b'] };
const DIM_TEAM: DimensionType = { id: 'team', label: 'Team', values: ['platform', 'growth'] };

function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('expected value to be defined');
  return value;
}

function resolutionFor(resolutions: readonly ResourceResolution[], resourceId: string): ResourceResolution {
  return must(resolutions.find((r) => r.resourceId === resourceId));
}

function assignmentOf(resolution: ResourceResolution, dimensionId: string): DimensionAssignment | undefined {
  return resolution.assignments[dimensionId];
}

describe('@workspec/cost-engine package identity', () => {
  it('exports its package identity', () => {
    expect(COST_ENGINE_PACKAGE).toBe('@workspec/cost-engine');
  });

  it('targets the current cost-schema version', () => {
    expect(ENGINE_TARGET_SCHEMA).toBe(SCHEMA_VERSION);
  });
});

describe('globToRegExp / matchRule', () => {
  it('treats * as the only wildcard, anchored start-to-end', () => {
    const re = globToRegExp('rg-workspec-*');
    expect(re.test('rg-workspec-prod')).toBe(true);
    expect(re.test('rg-workspec-')).toBe(true);
    expect(re.test('rg-workspecprod')).toBe(false); // no literal dash before the wildcard match
    expect(re.test('xrg-workspec-prod')).toBe(false); // anchored at start
  });

  it('regex-escapes non-wildcard glob characters literally', () => {
    const re = globToRegExp('foo.bar');
    expect(re.test('foo.bar')).toBe(true);
    expect(re.test('fooXbar')).toBe(false);
  });

  it('an empty match object matches every resource', () => {
    expect(matchRule({ match: {} }, resource({ id: 'r1', name: 'anything' }))).toBe(true);
  });

  it('ANDs every present match field', () => {
    const rule = { match: { resourceGroup: 'rg-a', tagExists: 'client' } };
    expect(matchRule(rule, resource({ id: '1', name: 'n', resourceGroup: 'rg-a', tags: { client: 'x' } }))).toBe(true);
    expect(matchRule(rule, resource({ id: '2', name: 'n', resourceGroup: 'rg-a' }))).toBe(false); // missing tag
    expect(matchRule(rule, resource({ id: '3', name: 'n', resourceGroup: 'rg-b', tags: { client: 'x' } }))).toBe(false); // wrong rg
  });

  it('tagEquals requires exact value; tagExists ignores value', () => {
    const equalsRule = { match: { tagEquals: { name: 'env', value: 'prod' } } };
    expect(matchRule(equalsRule, resource({ id: '1', name: 'n', tags: { env: 'prod' } }))).toBe(true);
    expect(matchRule(equalsRule, resource({ id: '2', name: 'n', tags: { env: 'dev' } }))).toBe(false);
    expect(matchRule(equalsRule, resource({ id: '3', name: 'n' }))).toBe(false);

    const existsRule = { match: { tagExists: 'env' } };
    expect(matchRule(existsRule, resource({ id: '4', name: 'n', tags: { env: 'anything' } }))).toBe(true);
    expect(matchRule(existsRule, resource({ id: '5', name: 'n' }))).toBe(false);
  });

  it('resourceType and subscription are exact matches', () => {
    const rule = { match: { resourceType: 'Microsoft.Compute/virtualMachines', subscription: 'sub-9' } };
    expect(
      matchRule(rule, resource({ id: '1', name: 'n', type: 'Microsoft.Compute/virtualMachines', subscription: 'sub-9' })),
    ).toBe(true);
    expect(matchRule(rule, resource({ id: '2', name: 'n', type: 'Microsoft.Compute/virtualMachines', subscription: 'sub-1' }))).toBe(
      false,
    );
  });
});

describe('resolveAttribution: per-dimension first-set-wins', () => {
  it('a later matching rule is shadowed on an already-assigned dimension, naming the winner', () => {
    const inv = inventoryOf([resource({ id: 'r1', name: 'r1', resourceGroup: 'rg-a', tags: { env: 'x' } })]);
    const attribution = attributionOf(
      [DIM_PRODUCT],
      [
        { id: 'first', name: 'First', match: { resourceGroup: 'rg-a' }, assign: { product: 'a' } },
        { id: 'second', name: 'Second', match: { tagExists: 'env' }, assign: { product: 'b' } },
      ],
    );
    const { resolutions, ruleStats } = resolveAttribution(inv, attribution);
    const res = resolutionFor(resolutions, 'r1');
    expect(assignmentOf(res, 'product')).toEqual({ kind: 'value', value: 'a', provenance: 'first' });

    const firstTrace = must(res.trace.find((t) => t.ruleId === 'first'));
    expect(firstTrace.tookDimensions).toEqual(['product']);
    expect(firstTrace.shadowed).toEqual([]);

    const secondTrace = must(res.trace.find((t) => t.ruleId === 'second'));
    expect(secondTrace.tookDimensions).toEqual([]);
    expect(secondTrace.shadowed).toEqual([{ dimensionId: 'product', winnerRuleId: 'first' }]);

    expect(ruleStats['first']).toEqual({ ruleId: 'first', matched: 1, won: 1 });
    expect(ruleStats['second']).toEqual({ ruleId: 'second', matched: 1, won: 0 });
    expect(res.didNotMatchCount).toBe(0);
  });

  it('a rule can win one dimension and be shadowed on another for the same resource', () => {
    const inv = inventoryOf([resource({ id: 'r1', name: 'r1', resourceGroup: 'rg-a' })]);
    const attribution = attributionOf(
      [DIM_PRODUCT, DIM_TEAM],
      [
        { id: 'r-product', name: 'Product', match: {}, assign: { product: 'a' } },
        { id: 'r-both', name: 'Both', match: {}, assign: { product: 'b', team: 'platform' } },
      ],
    );
    const { resolutions } = resolveAttribution(inv, attribution);
    const res = resolutionFor(resolutions, 'r1');
    expect(assignmentOf(res, 'product')).toEqual({ kind: 'value', value: 'a', provenance: 'r-product' });
    expect(assignmentOf(res, 'team')).toEqual({ kind: 'value', value: 'platform', provenance: 'r-both' });

    const bothTrace = must(res.trace.find((t) => t.ruleId === 'r-both'));
    expect(bothTrace.tookDimensions).toEqual(['team']);
    expect(bothTrace.shadowed).toEqual([{ dimensionId: 'product', winnerRuleId: 'r-product' }]);
  });

  it('didNotMatchCount counts rules that never matched, and they are omitted from trace', () => {
    const inv = inventoryOf([resource({ id: 'r1', name: 'r1', resourceGroup: 'rg-a' })]);
    const attribution = attributionOf(
      [DIM_PRODUCT],
      [
        { id: 'no-match', name: 'No match', match: { resourceGroup: 'rg-z' }, assign: { product: 'a' } },
        { id: 'catch-all', name: 'Catch all', match: {}, assign: { product: 'b' } },
      ],
    );
    const { resolutions } = resolveAttribution(inv, attribution);
    const res = resolutionFor(resolutions, 'r1');
    expect(res.didNotMatchCount).toBe(1);
    expect(res.trace.map((t) => t.ruleId)).toEqual(['catch-all']);
  });

  it('split takes an unassigned dimension; a later split/assign on the same dimension is shadowed', () => {
    const inv = inventoryOf([resource({ id: 'r1', name: 'r1' })]);
    const attribution = attributionOf(
      [DIM_PRODUCT],
      [
        { id: 'splitter', name: 'Splitter', match: {}, split: { product: { a: 0.6, b: 0.4 } } },
        { id: 'loser', name: 'Loser', match: {}, assign: { product: 'a' } },
      ],
    );
    const { resolutions } = resolveAttribution(inv, attribution);
    const res = resolutionFor(resolutions, 'r1');
    const asg = assignmentOf(res, 'product');
    expect(asg?.kind).toBe('split');
    if (asg?.kind === 'split') {
      expect(asg.parts).toEqual([
        { value: 'a', ratio: 0.6 },
        { value: 'b', ratio: 0.4 },
      ]);
      expect(asg.provenance).toBe('splitter');
    }
    const loserTrace = must(res.trace.find((t) => t.ruleId === 'loser'));
    expect(loserTrace.shadowed).toEqual([{ dimensionId: 'product', winnerRuleId: 'splitter' }]);
  });

  it('fromTag assigns only when the tag is present; absent tag neither takes nor shadows', () => {
    const inv = inventoryOf([
      resource({ id: 'has-tag', name: 'has-tag', tags: { team: 'growth' } }),
      resource({ id: 'no-tag', name: 'no-tag' }),
    ]);
    const attribution = attributionOf([DIM_TEAM], [{ id: 'from-tag', name: 'From tag', match: {}, fromTag: { team: 'team' } }]);
    const { resolutions, ruleStats } = resolveAttribution(inv, attribution);

    const withTag = resolutionFor(resolutions, 'has-tag');
    expect(assignmentOf(withTag, 'team')).toEqual({ kind: 'value', value: 'growth', provenance: 'from-tag' });
    const withTagTrace = must(withTag.trace.find((t) => t.ruleId === 'from-tag'));
    expect(withTagTrace.tookDimensions).toEqual(['team']);

    const withoutTag = resolutionFor(resolutions, 'no-tag');
    expect(assignmentOf(withoutTag, 'team')).toBeUndefined();
    const withoutTagTrace = must(withoutTag.trace.find((t) => t.ruleId === 'from-tag'));
    expect(withoutTagTrace.tookDimensions).toEqual([]);
    expect(withoutTagTrace.shadowed).toEqual([]);

    expect(must(ruleStats['from-tag'])).toEqual({ ruleId: 'from-tag', matched: 2, won: 1 });
  });

  it('fromTag assigning an undeclared value still assigns, with an unknown-dimension-value diagnostic', () => {
    const inv = inventoryOf([resource({ id: 'r1', name: 'r1', tags: { team: 'not-declared' } })]);
    const attribution = attributionOf([DIM_TEAM], [{ id: 'from-tag', name: 'From tag', match: {}, fromTag: { team: 'team' } }]);
    const { resolutions, diagnostics } = resolveAttribution(inv, attribution);
    const res = resolutionFor(resolutions, 'r1');
    expect(assignmentOf(res, 'team')).toEqual({ kind: 'value', value: 'not-declared', provenance: 'from-tag' });
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ code: 'unknown-dimension-value', severity: 'warning', ruleId: 'from-tag', resourceId: 'r1', dimensionId: 'team' }),
    );
  });

  it('fromTag reading the reserved word "unattributed" still assigns it, with a reserved-dimension-value diagnostic', () => {
    const inv = inventoryOf([resource({ id: 'r1', name: 'r1', tags: { team: 'unattributed' } })]);
    const attribution = attributionOf([DIM_TEAM], [{ id: 'from-tag', name: 'From tag', match: {}, fromTag: { team: 'team' } }]);
    const { resolutions, diagnostics } = resolveAttribution(inv, attribution);
    const res = resolutionFor(resolutions, 'r1');
    expect(assignmentOf(res, 'team')).toEqual({ kind: 'value', value: 'unattributed', provenance: 'from-tag' });
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ code: 'reserved-dimension-value', severity: 'warning', resourceId: 'r1', dimensionId: 'team' }),
    );
  });

  it('assign/split resolving to a declared "unattributed" value still emits reserved-dimension-value (not unknown-dimension-value)', () => {
    const DIM_WITH_RESERVED: DimensionType = { id: 'client', label: 'Client', values: ['unattributed', 'acme'] };
    const inv = inventoryOf([resource({ id: 'r1', name: 'r1' })]);
    const attribution = attributionOf(
      [DIM_WITH_RESERVED],
      [{ id: 'r1-rule', name: 'Rule', match: {}, assign: { client: 'unattributed' } }],
    );
    const { resolutions, diagnostics } = resolveAttribution(inv, attribution);
    const res = resolutionFor(resolutions, 'r1');
    expect(assignmentOf(res, 'client')).toEqual({ kind: 'value', value: 'unattributed', provenance: 'r1-rule' });
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ code: 'reserved-dimension-value', severity: 'warning', resourceId: 'r1', dimensionId: 'client' }),
    );
    // Declared (not dynamic), so it must NOT also fire unknown-dimension-value.
    expect(diagnostics.filter((d) => d.code === 'unknown-dimension-value')).toEqual([]);
  });

  it('an override assigning the reserved "unattributed" value also emits reserved-dimension-value', () => {
    const DIM_WITH_RESERVED: DimensionType = { id: 'client', label: 'Client', values: ['unattributed', 'acme'] };
    const inv = inventoryOf([resource({ id: 'r1', name: 'r1' })]);
    const attribution = attributionOf([DIM_WITH_RESERVED], [], [{ resourceId: 'r1', assign: { client: 'unattributed' } }]);
    const { resolutions, diagnostics } = resolveAttribution(inv, attribution);
    const res = resolutionFor(resolutions, 'r1');
    expect(assignmentOf(res, 'client')).toEqual({ kind: 'value', value: 'unattributed', provenance: 'override' });
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ code: 'reserved-dimension-value', severity: 'warning', resourceId: 'r1', dimensionId: 'client' }),
    );
  });

  it('overrides unconditionally overwrite, even a dimension a rule already won, with a trailing trace entry', () => {
    const inv = inventoryOf([resource({ id: 'r1', name: 'r1' })]);
    const attribution = attributionOf(
      [DIM_PRODUCT],
      [{ id: 'r1-rule', name: 'Rule', match: {}, assign: { product: 'a' } }],
      [{ resourceId: 'r1', assign: { product: 'b' } }],
    );
    const { resolutions } = resolveAttribution(inv, attribution);
    const res = resolutionFor(resolutions, 'r1');
    expect(assignmentOf(res, 'product')).toEqual({ kind: 'value', value: 'b', provenance: 'override' });
    // The rule's own trace entry still reflects what it won DURING the cascade.
    const ruleTrace = must(res.trace.find((t) => t.ruleId === 'r1-rule'));
    expect(ruleTrace.tookDimensions).toEqual(['product']);
    expect(res.overrideTrace).toEqual({ tookDimensions: ['product'] });
  });

  it('an override targeting an unknown resource id emits override-unknown-resource', () => {
    const inv = inventoryOf([resource({ id: 'r1', name: 'r1' })]);
    const attribution = attributionOf([DIM_PRODUCT], [], [{ resourceId: 'does-not-exist', assign: { product: 'a' } }]);
    const { diagnostics } = resolveAttribution(inv, attribution);
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ code: 'override-unknown-resource', severity: 'warning', resourceId: 'does-not-exist' }),
    );
  });

  it('emits rule-never-matched (matched === 0) and rule-never-won (matched > 0, won === 0)', () => {
    const inv = inventoryOf([resource({ id: 'r1', name: 'r1' })]);
    const attribution = attributionOf(
      [DIM_PRODUCT],
      [
        { id: 'unreachable', name: 'Unreachable', match: { resourceGroup: 'rg-nowhere' }, assign: { product: 'a' } },
        { id: 'first', name: 'First', match: {}, assign: { product: 'a' } },
        { id: 'always-shadowed', name: 'Always shadowed', match: {}, assign: { product: 'b' } },
      ],
    );
    const { diagnostics } = resolveAttribution(inv, attribution);
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ code: 'rule-never-matched', severity: 'info', ruleId: 'unreachable' }),
    );
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ code: 'rule-never-won', severity: 'info', ruleId: 'always-shadowed' }),
    );
  });

  it('is pure: does not mutate frozen inventory/attribution inputs', () => {
    const inv = inventoryOf([resource({ id: 'r1', name: 'r1', tags: { env: 'x' } })]);
    const attribution = attributionOf(
      [DIM_PRODUCT],
      [{ id: 'r1-rule', name: 'Rule', match: { tagExists: 'env' }, assign: { product: 'a' } }],
    );
    deepFreeze(inv);
    deepFreeze(attribution);
    expect(() => resolveAttribution(inv, attribution)).not.toThrow();
  });
});

describe('joinSpend', () => {
  it('sums multiple rows across multiple spend docs onto the same resource', () => {
    const inv = inventoryOf([resource({ id: 'r1', name: 'r1' })]);
    const doc1 = spendOf([{ resourceId: 'r1', amount: 10, currency: 'USD', period: '2026-06', serviceCategory: 'X' }]);
    const doc2 = spendOf([{ resourceId: 'r1', amount: 5, currency: 'USD', period: '2026-07', serviceCategory: 'X' }]);
    const { resourceSpend, totals } = joinSpend(inv, [doc1, doc2]);
    expect(resourceSpend['r1']).toBe(15);
    expect(totals.inventorySpend).toBe(15);
    expect(totals.totalSpend).toBe(15);
  });

  it('an orphan row (unknown resourceId) is diagnosed, excluded from resourceSpend, counted in orphans/totals', () => {
    const inv = inventoryOf([resource({ id: 'r1', name: 'r1' })]);
    const doc = spendOf([
      { resourceId: 'r1', amount: 10, currency: 'USD', period: '2026-06', serviceCategory: 'X' },
      { resourceId: 'ghost', amount: 7, currency: 'USD', period: '2026-06', serviceCategory: 'X' },
    ]);
    const { resourceSpend, orphans, totals, diagnostics } = joinSpend(inv, [doc]);
    expect(resourceSpend['r1']).toBe(10);
    expect(resourceSpend['ghost']).toBeUndefined();
    expect(orphans.rows).toEqual([{ resourceId: 'ghost', amount: 7, currency: 'USD', period: '2026-06', serviceCategory: 'X' }]);
    expect(orphans.totalAmount).toBe(7);
    expect(totals.orphanSpend).toBe(7);
    expect(totals.inventorySpend).toBe(10);
    expect(totals.totalSpend).toBe(17);
    expect(diagnostics).toContainEqual(expect.objectContaining({ code: 'orphan-spend-row', severity: 'warning', resourceId: 'ghost' }));
  });

  it('an unresolved row is counted in unresolvedSpend, is not an orphan, and is not diagnosed', () => {
    const inv = inventoryOf([resource({ id: 'r1', name: 'r1' })]);
    const doc = spendOf([{ amount: 4, currency: 'USD', period: '2026-06', serviceCategory: 'Support', unresolved: true, sourceLabel: 'x' }]);
    const { totals, orphans, diagnostics } = joinSpend(inv, [doc]);
    expect(totals.unresolvedSpend).toBe(4);
    expect(totals.orphanSpend).toBe(0);
    expect(orphans.rows).toEqual([]);
    expect(diagnostics.filter((d) => d.code === 'orphan-spend-row')).toEqual([]);
    expect(totals.totalSpend).toBe(4);
  });

  it('resourcesWithoutSpend counts inventory resources with zero matching rows', () => {
    const inv = inventoryOf([resource({ id: 'r1', name: 'r1' }), resource({ id: 'r2', name: 'r2' })]);
    const doc = spendOf([{ resourceId: 'r1', amount: 10, currency: 'USD', period: '2026-06', serviceCategory: 'X' }]);
    const { resourceSpend, totals } = joinSpend(inv, [doc]);
    expect(resourceSpend['r2']).toBe(0);
    expect(totals.resourcesWithoutSpend).toBe(1);
  });

  it('more than one currency emits a single mixed-currency error diagnostic and still sums numerically', () => {
    const inv = inventoryOf([resource({ id: 'r1', name: 'r1' })]);
    const doc = spendOf([
      { resourceId: 'r1', amount: 10, currency: 'USD', period: '2026-06', serviceCategory: 'X' },
      { resourceId: 'r1', amount: 5, currency: 'NZD', period: '2026-06', serviceCategory: 'X' },
    ]);
    const { resourceSpend, totals, diagnostics } = joinSpend(inv, [doc]);
    expect(resourceSpend['r1']).toBe(15);
    expect(totals.currencies).toEqual(['NZD', 'USD']);
    expect(diagnostics.filter((d) => d.code === 'mixed-currency')).toHaveLength(1);
    expect(must(diagnostics.find((d) => d.code === 'mixed-currency')).severity).toBe('error');
  });
});

describe('rollupBy / crossTab / computeCoverage', () => {
  const resolutions: ResourceResolution[] = [
    {
      resourceId: 'literal',
      assignments: { product: { kind: 'value', value: 'a', provenance: 'r1' }, team: { kind: 'value', value: 'platform', provenance: 'r1' } },
      trace: [],
      didNotMatchCount: 0,
    },
    {
      resourceId: 'split',
      assignments: {
        product: {
          kind: 'split',
          parts: [
            { value: 'a', ratio: 0.6 },
            { value: 'b', ratio: 0.4 },
          ],
          provenance: 'r2',
        },
      },
      trace: [],
      didNotMatchCount: 0,
    },
    { resourceId: 'unattributed', assignments: {}, trace: [], didNotMatchCount: 0 },
  ];
  const resourceSpend = { literal: 100, split: 50, unattributed: 20 };

  it('rollupBy distributes a split resource by ratio and buckets unresolved resources as unattributed', () => {
    const rollup = rollupBy(resolutions, resourceSpend, 'product');
    const byKey = Object.fromEntries(rollup.buckets.map((b) => [b.key, b.amount]));
    expect(byKey['a']).toBe(100 + 50 * 0.6);
    expect(byKey['b']).toBe(50 * 0.4);
    expect(byKey['unattributed']).toBe(20);
  });

  it('crossTab distributes shares on both axes', () => {
    const ct = crossTab(resolutions, resourceSpend, 'product', 'team');
    const cell = (row: string, col: string) => ct.cells.find((c) => c.rowKey === row && c.colKey === col)?.amount ?? 0;
    expect(cell('a', 'platform')).toBe(100);
    expect(cell('a', 'unattributed')).toBe(50 * 0.6); // split resource has no `team` assignment
    expect(cell('b', 'unattributed')).toBe(50 * 0.4);
    expect(cell('unattributed', 'unattributed')).toBe(20);
  });

  it('crossTab keys cells structurally, so fromTag values containing spaces and shared first tokens are not corrupted (regression)', () => {
    // Regression for a bug where cells were keyed by joining `${rowKey} ${colKey}`
    // with a space and splitting back on it: "acme dairy"/"acme foods"/"acme"
    // would silently truncate or collide since fromTag-derived dimension values
    // (unrestricted resourceTagValues) may themselves contain spaces.
    const inv = inventoryOf([
      resource({ id: 'r1', name: 'r1', tags: { client: 'acme dairy' } }),
      resource({ id: 'r2', name: 'r2', tags: { client: 'acme foods' } }),
      resource({ id: 'r3', name: 'r3', tags: { client: 'acme' } }),
    ]);
    const DIM_CLIENT: DimensionType = { id: 'client', label: 'Client', values: ['acme'] };
    const attribution = attributionOf(
      [DIM_CLIENT, DIM_TEAM],
      [
        { id: 'r-client', name: 'Client', match: {}, fromTag: { client: 'client' } },
        { id: 'r-team', name: 'Team', match: {}, assign: { team: 'platform' } },
      ],
    );
    const { resolutions: spacedResolutions } = resolveAttribution(inv, attribution);
    const spacedSpend = { r1: 10, r2: 20, r3: 30 };
    const ct = crossTab(spacedResolutions, spacedSpend, 'client', 'team');

    const amountFor = (rowKey: string) => ct.cells.find((c) => c.rowKey === rowKey && c.colKey === 'platform')?.amount;
    expect(ct.cells).toHaveLength(3);
    expect(amountFor('acme dairy')).toBe(10);
    expect(amountFor('acme foods')).toBe(20);
    expect(amountFor('acme')).toBe(30);
    expect(new Set(ct.cells.map((c) => c.rowKey))).toEqual(new Set(['acme dairy', 'acme foods', 'acme']));
  });

  it('computeCoverage treats a split as attributed and sums unattributed spend/count', () => {
    const coverage = computeCoverage(resolutions, resourceSpend, 'product', true);
    expect(coverage.attributedSpend).toBe(150);
    expect(coverage.unattributedSpend).toBe(20);
    expect(coverage.unattributedCount).toBe(1);
    expect(coverage.totalSpend).toBe(170);
    expect(coverage.ratio).toBeCloseTo(150 / 170);
    expect(coverage.isPrimary).toBe(true);
  });

  it('computeCoverage.ratio is 1 (not NaN) when totalSpend is 0', () => {
    expect(computeCoverage([], {}, 'product', true).ratio).toBe(1);
  });

  it('computeCoverage.ratio can exceed 1 when unattributed spend is a net credit (negative)', () => {
    // Credits/refunds (schema-allowed negative Spend.amount) can make the
    // unattributed bucket net-negative, pushing totalSpend below
    // attributedSpend — ratio is raw, unclamped math, so it can exceed 1.
    const creditResolutions: ResourceResolution[] = [
      { resourceId: 'attributed', assignments: { product: { kind: 'value', value: 'a', provenance: 'r1' } }, trace: [], didNotMatchCount: 0 },
      { resourceId: 'credit', assignments: {}, trace: [], didNotMatchCount: 0 },
    ];
    const creditSpend = { attributed: 100, credit: -20 };
    const coverage = computeCoverage(creditResolutions, creditSpend, 'product', true);
    expect(coverage.attributedSpend).toBe(100);
    expect(coverage.unattributedSpend).toBe(-20);
    expect(coverage.totalSpend).toBe(80);
    expect(coverage.ratio).toBeCloseTo(1.25);
    expect(coverage.ratio).toBeGreaterThan(1);
  });

  it('computeCoverage.ratio is 1 when attributed/unattributed amounts net totalSpend to exactly 0', () => {
    const nettingResolutions: ResourceResolution[] = [
      { resourceId: 'attributed', assignments: { product: { kind: 'value', value: 'a', provenance: 'r1' } }, trace: [], didNotMatchCount: 0 },
      { resourceId: 'credit', assignments: {}, trace: [], didNotMatchCount: 0 },
    ];
    const nettingSpend = { attributed: 50, credit: -50 };
    const coverage = computeCoverage(nettingResolutions, nettingSpend, 'product', true);
    expect(coverage.totalSpend).toBe(0);
    expect(coverage.ratio).toBe(1);
  });
});

describe('attribute()', () => {
  it('assembles resolution + spend + coverage + rollups + primary cross-tabs into one result', () => {
    const inv = inventoryOf([
      resource({ id: 'r1', name: 'r1', resourceGroup: 'rg-a' }),
      resource({ id: 'r2', name: 'r2', resourceGroup: 'rg-b' }),
    ]);
    const attribution = attributionOf(
      [DIM_PRODUCT, DIM_TEAM],
      [
        { id: 'r-product', name: 'Product', match: { resourceGroup: 'rg-a' }, assign: { product: 'a' } },
        { id: 'r-team', name: 'Team', match: {}, assign: { team: 'platform' } },
      ],
    );
    const spend = spendOf([
      { resourceId: 'r1', amount: 60, currency: 'USD', period: '2026-07', serviceCategory: 'X' },
      { resourceId: 'r2', amount: 40, currency: 'USD', period: '2026-07', serviceCategory: 'X' },
    ]);
    const result = attribute(inv, [spend], attribution);

    expect(result.primaryDimensionId).toBe('product');
    expect(result.coverage.map((c) => c.dimensionId)).toEqual(['product', 'team']);
    expect(must(result.coverage.find((c) => c.dimensionId === 'product')).attributedSpend).toBe(60);
    expect(must(result.coverage.find((c) => c.dimensionId === 'team')).attributedSpend).toBe(100);
    expect(result.rollups.map((r) => r.dimensionId)).toEqual(['product', 'team']);
    // crossTabs: primary (product) × every OTHER dimension only.
    expect(result.crossTabs.map((c) => `${c.rowDimensionId}x${c.colDimensionId}`)).toEqual(['productxteam']);
    expect(result.resourceSpend).toEqual({ r1: 60, r2: 40 });
    expect(result.totals.totalSpend).toBe(100);
  });
});

describe('serializeSplitValue', () => {
  it('orders by ratio descending then value ascending, trimming trailing zeros', () => {
    expect(
      serializeSplitValue([
        { value: 'workspec', ratio: 0.6 },
        { value: 'atrium', ratio: 0.4 },
      ]),
    ).toBe('workspec:60|atrium:40');
  });

  it('formats a non-round percentage without floating-point noise', () => {
    expect(
      serializeSplitValue([
        { value: 'a', ratio: 0.335 },
        { value: 'b', ratio: 0.665 },
      ]),
    ).toBe('b:66.5|a:33.5');
  });

  it('breaks a ratio tie by value ascending', () => {
    expect(
      serializeSplitValue([
        { value: 'zeta', ratio: 0.5 },
        { value: 'alpha', ratio: 0.5 },
      ]),
    ).toBe('alpha:50|zeta:50');
  });
});

describe('plan() / buildTagPlan()', () => {
  it('omits an entry only when both current and desired are null; otherwise add/change/remove/noop', () => {
    const inv = inventoryOf([
      resource({ id: 'add', name: 'add' }),
      resource({ id: 'change', name: 'change', tags: { 'fs-product': 'old' } }),
      resource({ id: 'remove', name: 'remove', tags: { 'fs-product': 'stale' } }),
      resource({ id: 'noop', name: 'noop', tags: { 'fs-product': 'a' } }),
      resource({ id: 'omit', name: 'omit', resourceGroup: 'rg-unresolved' }),
    ]);
    const attribution = attributionOf(
      [DIM_PRODUCT],
      [
        { id: 'r-add', name: 'Add', match: { nameGlob: 'add' }, assign: { product: 'a' } },
        { id: 'r-change', name: 'Change', match: { nameGlob: 'change' }, assign: { product: 'a' } },
        { id: 'r-noop', name: 'Noop', match: { nameGlob: 'noop' }, assign: { product: 'a' } },
        // "remove" and "omit" match no rule: product stays unresolved (desired null).
      ],
    );
    const entries = plan(inv, attribution, { product: 'fs-product' });
    const byResource = Object.fromEntries(entries.map((e) => [e.resourceId, e]));

    expect(byResource['add']).toEqual({ resourceId: 'add', tag: 'fs-product', current: null, desired: 'a', action: 'add' });
    expect(byResource['change']).toEqual({ resourceId: 'change', tag: 'fs-product', current: 'old', desired: 'a', action: 'change' });
    expect(byResource['remove']).toEqual({ resourceId: 'remove', tag: 'fs-product', current: 'stale', desired: null, action: 'remove' });
    expect(byResource['noop']).toEqual({ resourceId: 'noop', tag: 'fs-product', current: 'a', desired: 'a', action: 'noop' });
    expect(byResource['omit']).toBeUndefined(); // both null: omitted

    // Sorted ascending by (resourceId, tag).
    expect(entries.map((e) => e.resourceId)).toEqual([...entries.map((e) => e.resourceId)].sort());
  });

  it('serializes a split assignment via serializeSplitValue as the desired tag value', () => {
    const inv = inventoryOf([resource({ id: 'r1', name: 'r1' })]);
    const attribution = attributionOf([DIM_PRODUCT], [{ id: 'r1-rule', name: 'Split', match: {}, split: { product: { a: 0.6, b: 0.4 } } }]);
    const entries = plan(inv, attribution, { product: 'fs-product' });
    expect(must(entries[0]).desired).toBe('a:60|b:40');
  });

  it('buildTagPlan produces a schema-valid TagPlan artifact anchored on inventory.spec.asOf', () => {
    const inv = inventoryOf([resource({ id: 'r1', name: 'r1' })]);
    const attribution = attributionOf([DIM_PRODUCT], [{ id: 'r1-rule', name: 'Rule', match: {}, assign: { product: 'a' } }]);
    const tagPlan = buildTagPlan(inv, attribution, { product: 'fs-product' }, { slug: 'test-plan' });
    expect(tagPlan.spec.baselineAsOf).toBe(inv.spec.asOf);
    expect(TagPlanArtifact.safeParse(tagPlan).success).toBe(true);
  });
});

// Recursively freeze a plain-object/array tree (used by purity tests).
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
  }
  return value;
}
