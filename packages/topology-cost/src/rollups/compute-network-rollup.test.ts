import { describe, expect, it } from 'vitest';
import { makeResolvedResource, makeResolvedTopology } from '../../test/helpers/resolved-topology-factory.js';
import type { NodeCost } from '../model/node-cost.types.js';
import { computeNetworkRollup } from './compute-network-rollup.js';

function node(slug: string, monthly: number): NodeCost {
  return { slug, monthly, mode: 'payg', sku: 'sku-a', committed: false };
}

describe('computeNetworkRollup', () => {
  it('groups node monthly cost by the network placement, unplaced resources under null', () => {
    const resolved = makeResolvedTopology({
      resources: [
        makeResolvedResource({ slug: 'app', network: 'snet-workload' }),
        makeResolvedResource({ slug: 'front-door', network: null }),
      ],
    });
    const nodes = [node('app', 100), node('front-door', 45)];

    expect(computeNetworkRollup(resolved, nodes)).toEqual([
      { key: 'snet-workload', monthly: 100 },
      { key: null, monthly: 45 },
    ]);
  });
});
