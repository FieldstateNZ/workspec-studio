import { describe, expect, it } from 'vitest';
import type { ResourceCost } from '@workspec/topology-schema';
import { diffCost } from './diff-cost.js';

function cost(overrides: Partial<ResourceCost> = {}): ResourceCost {
  return { sku: 'p1v3', mode: 'payg', schedule: 'always', qty: 1, ...overrides };
}

describe('diffCost', () => {
  it('returns nothing when both sides are null', () => {
    expect(diffCost(null, null)).toEqual([]);
  });

  it('returns nothing when every priced field is equal', () => {
    expect(diffCost(cost(), cost())).toEqual([]);
  });

  it('reports each differing field (sku and qty here), never attribution', () => {
    const authored = cost({
      sku: 'p1v3',
      qty: 2,
      attribution: [{ container: 'api-server', share: 1 }],
    });
    const actual = cost({ sku: 'p0v3', qty: 1 });

    const diff = diffCost(authored, actual);

    expect(diff).toEqual([
      { key: 'sku', authored: 'p1v3', actual: 'p0v3' },
      { key: 'qty', authored: 2, actual: 1 },
    ]);
    expect(diff.some((d) => (d.key as string) === 'attribution')).toBe(false);
  });

  it('treats one side being null as every non-default field differing', () => {
    // qty:3 is non-default, so it still differs against null's implied default (1);
    // sku/mode/schedule have no default at all, so they differ unconditionally.
    const diff = diffCost(cost({ qty: 3 }), null);
    expect(diff.map((d) => d.key).sort()).toEqual(['mode', 'qty', 'schedule', 'sku']);
  });

  it('normalizes qty to its schema default (1) so a missing qty never manufactures a false divergence', () => {
    const authored = cost({ qty: 1 });
    // Simulates a hand-built DerivedTopology that skipped ResourceCost.parse() and omitted qty
    // entirely (TS would reject this literal; a real adapter output bypassing the schema would not).
    const actual = { sku: 'p1v3', mode: 'payg', schedule: 'always' } as unknown as ResourceCost;

    expect(diffCost(authored, actual)).toEqual([]);
  });

  it('still flags a genuine qty change when one side omits qty and the other is at a non-default value', () => {
    const authored = cost({ qty: 2 });
    const actual = { sku: 'p1v3', mode: 'payg', schedule: 'always' } as unknown as ResourceCost;

    expect(diffCost(authored, actual)).toEqual([{ key: 'qty', authored: 2, actual: 1 }]);
  });
});
