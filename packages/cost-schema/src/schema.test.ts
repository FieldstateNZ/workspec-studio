import { describe, expect, it } from 'vitest';
import {
  identifier,
  resourceTagName,
  resourceTagValue,
  InventoryArtifact,
  SpendArtifact,
  AttributionArtifact,
  TagPlanArtifact,
} from './index.js';

/** Narrows a possibly-undefined lookup/index result, failing the test loudly if absent. */
function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('expected value to be defined');
  return value;
}

// Factories (not shared fixtures): each test builds the minimal valid artifact
// it needs, then mutates one field to exercise a rule.

const SUB = '11111111-1111-1111-1111-111111111111';
const RID_A = `/subscriptions/${SUB}/resourceGroups/rg/providers/Microsoft.Compute/virtualMachines/vm-a`;
const RID_B = `/subscriptions/${SUB}/resourceGroups/rg/providers/Microsoft.Compute/virtualMachines/vm-b`;

function makeInventory(): Record<string, unknown> {
  return {
    apiVersion: 'workspec.io/v1alpha1',
    kind: 'Inventory',
    metadata: { id: 'demo' },
    spec: {
      asOf: '2026-07-01T00:00:00Z',
      scope: { subscriptions: [SUB] },
      resources: [
        {
          id: RID_A,
          name: 'vm-a',
          type: 'Microsoft.Compute/virtualMachines',
          location: 'australiaeast',
          resourceGroup: 'rg',
          subscription: SUB,
        },
        {
          id: RID_B,
          name: 'vm-b',
          type: 'Microsoft.Compute/virtualMachines',
          location: 'australiaeast',
          resourceGroup: 'rg',
          subscription: SUB,
        },
      ],
    },
  };
}

function makeSpend(): Record<string, unknown> {
  return {
    apiVersion: 'workspec.io/v1alpha1',
    kind: 'Spend',
    metadata: { id: 'demo' },
    spec: {
      rows: [
        {
          resourceId: RID_A,
          amount: 10,
          currency: 'NZD',
          period: '2026-06',
          serviceCategory: 'Compute',
        },
        {
          resourceId: RID_B,
          amount: 20,
          currency: 'NZD',
          period: '2026-06',
          serviceCategory: 'Compute',
        },
      ],
    },
  };
}

function makeAttribution(): Record<string, unknown> {
  return {
    apiVersion: 'workspec.io/v1alpha1',
    kind: 'Attribution',
    metadata: { id: 'demo' },
    spec: {
      dimensions: [
        { id: 'product', label: 'Product', values: ['atrium', 'workspec'] },
        { id: 'team', label: 'Team', values: ['platform', 'growth'] },
      ],
      rules: [{ id: 'r1', name: 'Rule 1', match: {}, assign: { product: 'atrium' } }],
      overrides: [{ resourceId: RID_A, assign: { team: 'platform' } }],
    },
  };
}

function makeTagPlan(): Record<string, unknown> {
  return {
    apiVersion: 'workspec.io/v1alpha1',
    kind: 'TagPlan',
    metadata: { id: 'demo' },
    spec: {
      baselineAsOf: '2026-07-01T00:00:00Z',
      tagMapping: { product: 'fs-product' },
      entries: [
        { resourceId: RID_A, tag: 'fs-product', current: null, desired: 'atrium', action: 'add' },
        {
          resourceId: RID_B,
          tag: 'fs-product',
          current: 'atrium',
          desired: 'atrium',
          action: 'noop',
        },
      ],
    },
  };
}

describe('shared primitives', () => {
  it('identifier accepts slugs and rejects non-slugs', () => {
    expect(identifier.safeParse('d4s_v5').success).toBe(true);
    expect(identifier.safeParse('has space').success).toBe(false);
    expect(identifier.safeParse('-leading').success).toBe(false);
    expect(identifier.safeParse('').success).toBe(false);
  });

  it('resourceTagName rejects forbidden characters and over-length names', () => {
    expect(resourceTagName.safeParse('fs-product').success).toBe(true);
    expect(resourceTagName.safeParse('bad<name').success).toBe(false);
    expect(resourceTagName.safeParse('bad/name').success).toBe(false);
    expect(resourceTagName.safeParse('a'.repeat(513)).success).toBe(false);
  });

  it('resourceTagValue allows colons/pipes but rejects over-length values', () => {
    expect(resourceTagValue.safeParse('workspec:60|atrium:40').success).toBe(true);
    expect(resourceTagValue.safeParse('a'.repeat(257)).success).toBe(false);
  });
});

describe('InventoryArtifact', () => {
  it('parses a minimal valid, sorted inventory', () => {
    expect(InventoryArtifact.safeParse(makeInventory()).success).toBe(true);
  });

  it('rejects an unsorted resources array', () => {
    const doc = makeInventory() as { spec: { resources: unknown[] } };
    doc.spec.resources.reverse();
    const res = InventoryArtifact.safeParse(doc);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(must(res.error.issues[0]).path).toEqual(['spec', 'resources', 1, 'id']);
    }
  });

  it('rejects a duplicate resource id', () => {
    const doc = makeInventory() as { spec: { resources: { id: string }[] } };
    must(doc.spec.resources[1]).id = must(doc.spec.resources[0]).id;
    const res = InventoryArtifact.safeParse(doc);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.path.join('.') === 'spec.resources.1.id')).toBe(true);
    }
  });

  it('accepts a provider-neutral resource id (no "/" required)', () => {
    const doc = makeInventory() as { spec: { resources: { id: string }[] } };
    doc.spec.resources = [{ ...must(doc.spec.resources[0]), id: 'vm-old-jenkins' }];
    expect(InventoryArtifact.safeParse(doc).success).toBe(true);
  });

  it('rejects an invalid tag name', () => {
    const doc = makeInventory() as { spec: { resources: Record<string, unknown>[] } };
    must(doc.spec.resources[0]).tags = { 'bad<tag': 'value' };
    expect(InventoryArtifact.safeParse(doc).success).toBe(false);
  });
});

describe('SpendArtifact', () => {
  it('parses a minimal valid, sorted spend record', () => {
    expect(SpendArtifact.safeParse(makeSpend()).success).toBe(true);
  });

  it('rejects a lowercase currency code', () => {
    const doc = makeSpend() as { spec: { rows: { currency: string }[] } };
    must(doc.spec.rows[0]).currency = 'nzd';
    const res = SpendArtifact.safeParse(doc);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(must(res.error.issues[0]).path).toEqual(['spec', 'rows', 0, 'currency']);
    }
  });

  it('rejects an out-of-range period', () => {
    const doc = makeSpend() as { spec: { rows: { period: string }[] } };
    must(doc.spec.rows[0]).period = '2026-13';
    expect(SpendArtifact.safeParse(doc).success).toBe(false);
  });

  it('rejects a row missing resourceId when not unresolved', () => {
    const doc = makeSpend() as { spec: { rows: Record<string, unknown>[] } };
    delete must(doc.spec.rows[0]).resourceId;
    const res = SpendArtifact.safeParse(doc);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.path.join('.') === 'spec.rows.0.resourceId')).toBe(
        true,
      );
    }
  });

  it('rejects an unresolved row that also carries resourceId', () => {
    const doc = makeSpend() as { spec: { rows: Record<string, unknown>[] } };
    must(doc.spec.rows[0]).unresolved = true;
    must(doc.spec.rows[0]).sourceLabel = 'Some label';
    expect(SpendArtifact.safeParse(doc).success).toBe(false);
  });

  it('rejects an unresolved row missing sourceLabel', () => {
    const doc = makeSpend() as { spec: { rows: Record<string, unknown>[] } };
    delete must(doc.spec.rows[0]).resourceId;
    must(doc.spec.rows[0]).unresolved = true;
    expect(SpendArtifact.safeParse(doc).success).toBe(false);
  });

  it('accepts a resolved row with both resourceId and sourceLabel (harmless provenance)', () => {
    const doc = makeSpend() as { spec: { rows: Record<string, unknown>[] } };
    must(doc.spec.rows[0]).sourceLabel = 'Provenance note';
    expect(SpendArtifact.safeParse(doc).success).toBe(true);
  });

  it('rejects an unsorted rows array', () => {
    const doc = makeSpend() as { spec: { rows: unknown[] } };
    doc.spec.rows.reverse();
    expect(SpendArtifact.safeParse(doc).success).toBe(false);
  });

  it('allows a negative amount (credit/refund)', () => {
    const doc = makeSpend() as { spec: { rows: { amount: number }[] } };
    must(doc.spec.rows[0]).amount = -5;
    expect(SpendArtifact.safeParse(doc).success).toBe(true);
  });
});

describe('AttributionArtifact', () => {
  it('parses a minimal valid attribution', () => {
    expect(AttributionArtifact.safeParse(makeAttribution()).success).toBe(true);
  });

  it('rejects a duplicate dimension id', () => {
    const doc = makeAttribution() as { spec: { dimensions: Record<string, unknown>[] } };
    doc.spec.dimensions.push({ id: 'product', label: 'Product again', values: ['x'] });
    const res = AttributionArtifact.safeParse(doc);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.path.join('.') === 'spec.dimensions.2.id')).toBe(true);
    }
  });

  it('rejects a duplicate value within a dimension', () => {
    const doc = makeAttribution() as { spec: { dimensions: { values: string[] }[] } };
    must(doc.spec.dimensions[0]).values.push('atrium');
    expect(AttributionArtifact.safeParse(doc).success).toBe(false);
  });

  it('rejects a duplicate rule id', () => {
    const doc = makeAttribution() as { spec: { rules: Record<string, unknown>[] } };
    doc.spec.rules.push({ id: 'r1', name: 'dup', match: {}, assign: { product: 'atrium' } });
    expect(AttributionArtifact.safeParse(doc).success).toBe(false);
  });

  it('rejects a rule with no effect', () => {
    const doc = makeAttribution() as { spec: { rules: Record<string, unknown>[] } };
    delete must(doc.spec.rules[0]).assign;
    const res = AttributionArtifact.safeParse(doc);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(must(res.error.issues[0]).path).toEqual(['spec', 'rules', 0]);
    }
  });

  it('rejects a rule referencing an unknown dimension in assign', () => {
    const doc = makeAttribution() as { spec: { rules: { assign: Record<string, string> }[] } };
    must(doc.spec.rules[0]).assign = { nope: 'atrium' };
    expect(AttributionArtifact.safeParse(doc).success).toBe(false);
  });

  it('rejects a rule referencing an undeclared value id in assign', () => {
    const doc = makeAttribution() as { spec: { rules: { assign: Record<string, string> }[] } };
    must(doc.spec.rules[0]).assign = { product: 'nope' };
    expect(AttributionArtifact.safeParse(doc).success).toBe(false);
  });

  it('rejects a dimension appearing in two effect fields on one rule', () => {
    const doc = makeAttribution() as { spec: { rules: Record<string, unknown>[] } };
    must(doc.spec.rules[0]).fromTag = { product: 'fs-product' };
    expect(AttributionArtifact.safeParse(doc).success).toBe(false);
  });

  it('accepts a well-formed split summing to 1', () => {
    const doc = makeAttribution() as { spec: { rules: Record<string, unknown>[] } };
    delete must(doc.spec.rules[0]).assign;
    must(doc.spec.rules[0]).split = { product: { atrium: 0.6, workspec: 0.4 } };
    expect(AttributionArtifact.safeParse(doc).success).toBe(true);
  });

  it('rejects split ratios that do not sum to 1', () => {
    const doc = makeAttribution() as { spec: { rules: Record<string, unknown>[] } };
    delete must(doc.spec.rules[0]).assign;
    must(doc.spec.rules[0]).split = { product: { atrium: 0.6, workspec: 0.6 } };
    expect(AttributionArtifact.safeParse(doc).success).toBe(false);
  });

  it('rejects a split with fewer than 2 value entries', () => {
    const doc = makeAttribution() as { spec: { rules: Record<string, unknown>[] } };
    delete must(doc.spec.rules[0]).assign;
    must(doc.spec.rules[0]).split = { product: { atrium: 1 } };
    expect(AttributionArtifact.safeParse(doc).success).toBe(false);
  });

  it('accepts a fromTag effect', () => {
    const doc = makeAttribution() as { spec: { rules: Record<string, unknown>[] } };
    delete must(doc.spec.rules[0]).assign;
    must(doc.spec.rules[0]).fromTag = { product: 'fs-product' };
    expect(AttributionArtifact.safeParse(doc).success).toBe(true);
  });

  it('accepts an empty match object (matches every resource)', () => {
    expect(AttributionArtifact.safeParse(makeAttribution()).success).toBe(true);
  });

  it('rejects a duplicate override resourceId', () => {
    const doc = makeAttribution() as { spec: { overrides: Record<string, unknown>[] } };
    doc.spec.overrides.push({ resourceId: RID_A, assign: { team: 'growth' } });
    expect(AttributionArtifact.safeParse(doc).success).toBe(false);
  });

  it('rejects an override assign referencing an unknown value id', () => {
    const doc = makeAttribution() as { spec: { overrides: { assign: Record<string, string> }[] } };
    must(doc.spec.overrides[0]).assign = { team: 'nope' };
    expect(AttributionArtifact.safeParse(doc).success).toBe(false);
  });
});

describe('TagPlanArtifact', () => {
  it('parses a minimal valid, sorted tag plan', () => {
    expect(TagPlanArtifact.safeParse(makeTagPlan()).success).toBe(true);
  });

  it('rejects action "add" when current is not null', () => {
    const doc = makeTagPlan() as { spec: { entries: Record<string, unknown>[] } };
    must(doc.spec.entries[0]).current = 'already-set';
    const res = TagPlanArtifact.safeParse(doc);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(must(res.error.issues[0]).path).toEqual(['spec', 'entries', 0, 'current']);
    }
  });

  it('rejects action "remove" when desired is not null', () => {
    const doc = makeTagPlan() as { spec: { entries: Record<string, unknown>[] } };
    must(doc.spec.entries[0]).action = 'remove';
    must(doc.spec.entries[0]).current = 'was-set';
    must(doc.spec.entries[0]).desired = 'still-set';
    expect(TagPlanArtifact.safeParse(doc).success).toBe(false);
  });

  it('rejects action "change" when current equals desired', () => {
    const doc = makeTagPlan() as { spec: { entries: Record<string, unknown>[] } };
    must(doc.spec.entries[0]).action = 'change';
    must(doc.spec.entries[0]).current = 'same';
    must(doc.spec.entries[0]).desired = 'same';
    expect(TagPlanArtifact.safeParse(doc).success).toBe(false);
  });

  it('rejects action "noop" when current and desired differ', () => {
    const doc = makeTagPlan() as { spec: { entries: Record<string, unknown>[] } };
    must(doc.spec.entries[1]).desired = 'different';
    expect(TagPlanArtifact.safeParse(doc).success).toBe(false);
  });

  it('allows a split-serialized desired value (":" and "|" are not forbidden)', () => {
    const doc = makeTagPlan() as { spec: { entries: Record<string, unknown>[] } };
    must(doc.spec.entries[0]).desired = 'workspec:60|atrium:40';
    expect(TagPlanArtifact.safeParse(doc).success).toBe(true);
  });

  it('rejects an unsorted entries array', () => {
    const doc = makeTagPlan() as { spec: { entries: unknown[] } };
    doc.spec.entries.reverse();
    expect(TagPlanArtifact.safeParse(doc).success).toBe(false);
  });

  it('rejects duplicate (resourceId, tag) entries', () => {
    const doc = makeTagPlan() as { spec: { entries: Record<string, unknown>[] } };
    doc.spec.entries = [
      { resourceId: RID_A, tag: 'fs-product', current: null, desired: 'atrium', action: 'add' },
      { resourceId: RID_A, tag: 'fs-product', current: 'atrium', desired: null, action: 'remove' },
    ];
    const res = TagPlanArtifact.safeParse(doc);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(
        res.error.issues.some(
          (i) => i.path.join('.') === 'spec.entries.1' && i.message.includes('duplicate entry'),
        ),
      ).toBe(true);
    }
  });

  it('rejects an empty tagMapping', () => {
    const doc = makeTagPlan() as { spec: { tagMapping: Record<string, string> } };
    doc.spec.tagMapping = {};
    expect(TagPlanArtifact.safeParse(doc).success).toBe(false);
  });
});
