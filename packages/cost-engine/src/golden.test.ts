import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  parseAttributionYaml,
  parseInventoryYaml,
  parseSpendYaml,
  serializeAttributionYaml,
  serializeInventoryYaml,
  serializeSpendYaml,
  TagPlanArtifact,
} from '@workspec/cost-schema';
import type { Attribution, Inventory, Spend } from '@workspec/cost-schema';
import { attribute, buildTagPlan } from './index.js';
import type { AttributeResult } from './index.js';
import {
  buildDemoAttribution,
  buildDemoInventory,
  buildDemoSpend,
  TAG_MAPPING,
} from './demo-estate.fixture.js';

// The committed golden fixture at test/fixtures/demo-estate/*.yaml IS the
// cross-implementation conformance artifact. The oracle assertions below pin
// the demo estate's headline numbers (independently re-derived from the same
// source data — see the C2 task write-up) so a regression is obvious even
// without reading the snapshot diff.

// src/ → cost-engine/ → test/fixtures/demo-estate/
const fixtureUrl = (file: string): string =>
  fileURLToPath(new URL(`../test/fixtures/demo-estate/${file}`, import.meta.url));
const read = (file: string): string => readFileSync(fixtureUrl(file), 'utf8');

function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('expected value to be defined');
  return value;
}

describe('demo-estate fixtures are byte-identical to demo-estate.fixture.ts serialized', () => {
  it('inventory', () => {
    expect(serializeInventoryYaml(buildDemoInventory())).toBe(read('demo.inventory.yaml'));
  });
  it('spend', () => {
    expect(serializeSpendYaml(buildDemoSpend())).toBe(read('demo.spend.yaml'));
  });
  it('attribution', () => {
    expect(serializeAttributionYaml(buildDemoAttribution())).toBe(read('demo.attribution.yaml'));
  });
});

describe('golden: fieldstate-azure demo estate', () => {
  let inventory: Inventory;
  let spend: Spend;
  let attribution: Attribution;
  let result: AttributeResult;

  beforeAll(() => {
    const inventoryRes = parseInventoryYaml(read('demo.inventory.yaml'));
    const spendRes = parseSpendYaml(read('demo.spend.yaml'));
    const attributionRes = parseAttributionYaml(read('demo.attribution.yaml'));
    if (!inventoryRes.ok) throw new Error('inventory fixture failed to parse');
    if (!spendRes.ok) throw new Error('spend fixture failed to parse');
    if (!attributionRes.ok) throw new Error('attribution fixture failed to parse');
    inventory = inventoryRes.data;
    spend = spendRes.data;
    attribution = attributionRes.data;
    result = attribute(inventory, [spend], attribution);
  });

  it('80 resources across 9 resource groups', () => {
    expect(inventory.spec.resources).toHaveLength(80);
    expect(new Set(inventory.spec.resources.map((r) => r.resourceGroup)).size).toBe(9);
  });

  it('total spend is $13,165/mo', () => {
    expect(result.totals.totalSpend).toBe(13165);
    expect(result.totals.inventorySpend).toBe(13165);
    expect(result.totals.orphanSpend).toBe(0);
    expect(result.totals.unresolvedSpend).toBe(0);
    expect(result.totals.resourcesWithoutSpend).toBe(0);
  });

  it('primary dimension is product, coverage 81.2% ($10,691 attributed, $2,474/20 unattributed)', () => {
    expect(result.primaryDimensionId).toBe('product');
    const coverage = must(result.coverage.find((c) => c.isPrimary));
    expect(coverage.dimensionId).toBe('product');
    expect(coverage.attributedSpend).toBe(10691);
    expect(coverage.unattributedSpend).toBe(2474);
    expect(coverage.unattributedCount).toBe(20);
    // Raw ratio; rounded to 1dp only in this comment: 81.2%.
    expect(coverage.ratio).toBeCloseTo(10691 / 13165, 10);
    expect(Math.round(coverage.ratio * 1000) / 10).toBe(81.2);
  });

  it('unattributed clusters by resource group: rg-legacy-misc 12/$1,159, rg-client-acme 5/$795, rg-client-kauri 3/$520', () => {
    const resourceGroupById = new Map(inventory.spec.resources.map((r) => [r.id, r.resourceGroup]));
    const clusters = new Map<string, { resources: number; spendPerMonth: number }>();
    for (const resolution of result.resolutions) {
      if (resolution.assignments['product'] !== undefined) continue; // attributed on the primary dimension
      const resourceGroup = must(resourceGroupById.get(resolution.resourceId));
      const spend_ = result.resourceSpend[resolution.resourceId] ?? 0;
      const bucket = clusters.get(resourceGroup) ?? { resources: 0, spendPerMonth: 0 };
      bucket.resources += 1;
      bucket.spendPerMonth += spend_;
      clusters.set(resourceGroup, bucket);
    }
    expect(clusters.get('rg-legacy-misc')).toEqual({ resources: 12, spendPerMonth: 1159 });
    expect(clusters.get('rg-client-acme')).toEqual({ resources: 5, spendPerMonth: 795 });
    expect(clusters.get('rg-client-kauri')).toEqual({ resources: 3, spendPerMonth: 520 });
    expect(clusters.size).toBe(3);
  });

  it('product rollup: workspec $3,761, atrium $3,343, shared $2,154, coffers $1,433, unattributed $2,474', () => {
    const rollup = must(result.rollups.find((r) => r.dimensionId === 'product'));
    const byKey = Object.fromEntries(rollup.buckets.map((b) => [b.key, b.amount]));
    expect(byKey['workspec']).toBe(3761);
    expect(byKey['atrium']).toBe(3343);
    expect(byKey['shared']).toBe(2154);
    expect(byKey['coffers']).toBe(1433);
    expect(byKey['unattributed']).toBe(2474);
    // Shares (1dp): 28.6 / 25.4 / 16.4 / 10.9 / 18.8 — comment only, not asserted in float form below.
    const total = Object.values(byKey).reduce((a, b) => a + b, 0);
    expect(total).toBe(13165);
    const share = (key: string): number => Math.round(((byKey[key] ?? 0) / total) * 1000) / 10;
    expect(share('workspec')).toBe(28.6);
    expect(share('atrium')).toBe(25.4);
    expect(share('shared')).toBe(16.4);
    expect(share('coffers')).toBe(10.9);
    expect(share('unattributed')).toBe(18.8);
  });

  it('costType rollup: capex $672, opex $12,493', () => {
    const rollup = must(result.rollups.find((r) => r.dimensionId === 'costType'));
    const byKey = Object.fromEntries(rollup.buckets.map((b) => [b.key, b.amount]));
    expect(byKey['capex']).toBe(672);
    expect(byKey['opex']).toBe(12493);
  });

  it('product x costType cross-tab, capex column: workspec $353, atrium $319, others $0', () => {
    const crossTab = must(result.crossTabs.find((c) => c.rowDimensionId === 'product' && c.colDimensionId === 'costType'));
    const capexOf = (rowKey: string): number => crossTab.cells.find((c) => c.rowKey === rowKey && c.colKey === 'capex')?.amount ?? 0;
    expect(capexOf('workspec')).toBe(353);
    expect(capexOf('atrium')).toBe(319);
    expect(capexOf('coffers')).toBe(0);
    expect(capexOf('shared')).toBe(0);
    expect(capexOf('unattributed')).toBe(0);
  });

  it('aks-shared ($1,840, split 60/40) contributes workspec $1,104 / atrium $736', () => {
    const aksId = must(inventory.spec.resources.find((r) => r.name === 'aks-shared')).id;
    expect(result.resourceSpend[aksId]).toBe(1840);
    const resolution = must(result.resolutions.find((r) => r.resourceId === aksId));
    const assignment = resolution.assignments['product'];
    expect(assignment?.kind).toBe('split');
    if (assignment?.kind === 'split') {
      const byValue = Object.fromEntries(assignment.parts.map((p) => [p.value, p.ratio]));
      expect(1840 * (byValue['workspec'] ?? 0)).toBe(1104);
      expect(1840 * (byValue['atrium'] ?? 0)).toBe(736);
    }
  });

  it('rule stats (matched/won) match an independent re-derivation from the same source data', () => {
    const oracle: Record<string, { matched: number; won: number }> = {
      r1: { matched: 21, won: 21 },
      r2: { matched: 19, won: 19 },
      r3: { matched: 9, won: 9 },
      r4: { matched: 1, won: 1 },
      r5: { matched: 10, won: 9 },
      r6: { matched: 8, won: 8 },
      r7: { matched: 17, won: 17 },
      r8: { matched: 80, won: 80 },
    };
    for (const [ruleId, expected] of Object.entries(oracle)) {
      expect(must(result.ruleStats[ruleId])).toEqual({ ruleId, ...expected });
    }
  });

  it('no diagnostics fire on the clean demo estate', () => {
    expect(result.diagnostics).toEqual([]);
  });

  describe('plan: tagMapping {product: fs-product, costType: fs-cost-type, client: fs-client}', () => {
    let entries: ReturnType<typeof buildTagPlan>['spec']['entries'];

    beforeAll(() => {
      const tagPlan = buildTagPlan(inventory, attribution, TAG_MAPPING, { slug: 'fieldstate-azure-2026-07' });
      expect(TagPlanArtifact.safeParse(tagPlan).success).toBe(true);
      expect(tagPlan.spec.baselineAsOf).toBe(inventory.spec.asOf);
      entries = tagPlan.spec.entries;
    });

    it('counts: 215 add, 2 change, 1 remove, 3 noop', () => {
      const counts = { add: 0, change: 0, remove: 0, noop: 0 };
      for (const entry of entries) counts[entry.action] += 1;
      expect(counts).toEqual({ add: 215, change: 2, remove: 1, noop: 3 });
      // NB: 215 + 2 + 1 + 3 = 221, not 220 — see this package's PR description
      // for the discrepancy note against the task write-up's parenthetical.
      expect(entries).toHaveLength(221);
    });

    it('the non-add, non-noop ops are exactly the three documented ones (change/change/remove)', () => {
      // "noop" is its own bucket (3 of them — see the counts test above);
      // this test is about the change/remove ops specifically.
      const nonAdd = entries
        .filter((e) => e.action !== 'add' && e.action !== 'noop')
        .map((e) => ({ resource: e.resourceId, tag: e.tag, current: e.current, desired: e.desired, action: e.action }));
      const byResourceId = new Map(inventory.spec.resources.map((r) => [r.id, r.name]));
      const named = nonAdd.map((e) => ({ ...e, resource: must(byResourceId.get(e.resource)) }));

      expect(named).toContainEqual({
        resource: 'workspec-logs',
        tag: 'fs-product',
        current: 'platform',
        desired: 'workspec',
        action: 'change',
      });
      expect(named).toContainEqual({
        resource: 'corebackups',
        tag: 'fs-product',
        current: 'workspec',
        desired: 'shared',
        action: 'change',
      });
      expect(named).toContainEqual({
        resource: 'test123storage',
        tag: 'fs-product',
        current: 'workspec',
        desired: null,
        action: 'remove',
      });
      expect(nonAdd).toHaveLength(3);
    });
  });

  describe('conformance snapshot', () => {
    it('matches the committed golden snapshot (attribute + plan)', () => {
      const tagPlan = buildTagPlan(inventory, attribution, TAG_MAPPING, { slug: 'fieldstate-azure-2026-07' });
      expect({ attribute: result, plan: tagPlan }).toMatchSnapshot();
    });
  });
});
