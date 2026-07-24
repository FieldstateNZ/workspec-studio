import { describe, expect, it } from 'vitest';
import type { NodeCost } from '../model/node-cost.types.js';
import { computeCommittedSplit } from './compute-committed-split.js';

function node(overrides: Partial<NodeCost> & { slug: string }): NodeCost {
  return { monthly: 0, mode: 'payg', sku: 'sku-a', committed: false, ...overrides };
}

describe('computeCommittedSplit', () => {
  it('splits totals by each node.committed flag', () => {
    const nodes = [
      node({ slug: 'reserved-a', monthly: 100, committed: true }),
      node({ slug: 'reserved-b', monthly: 50, committed: true }),
      node({ slug: 'payg-a', monthly: 30, committed: false }),
    ];

    expect(computeCommittedSplit(nodes)).toEqual({ all: 180, committed: 150, schedulable: 30 });
  });

  it('returns all zeros for no nodes', () => {
    expect(computeCommittedSplit([])).toEqual({ all: 0, committed: 0, schedulable: 0 });
  });

  it('schedulable equals all when nothing is committed', () => {
    const nodes = [node({ slug: 'a', monthly: 40 }), node({ slug: 'b', monthly: 60 })];
    expect(computeCommittedSplit(nodes)).toEqual({ all: 100, committed: 0, schedulable: 100 });
  });
});
