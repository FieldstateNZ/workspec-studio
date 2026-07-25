import { describe, expect, it } from 'vitest';
import { makeResolvedResource, makeResolvedTopology } from '../../test/helpers/resolved-topology-factory.js';
import type { NodeCost } from '../model/node-cost.types.js';
import { computeResourceGroupRollup } from './compute-resource-group-rollup.js';

function node(slug: string, monthly: number): NodeCost {
  return { slug, monthly, mode: 'payg', sku: 'sku-a', committed: false };
}

describe('computeResourceGroupRollup', () => {
  it('groups node monthly cost by the resource-group placement, unplaced resources under null', () => {
    const resolved = makeResolvedTopology({
      resources: [
        makeResolvedResource({ slug: 'app', resourceGroup: 'rg-app' }),
        makeResolvedResource({ slug: 'db', resourceGroup: 'rg-app' }),
        makeResolvedResource({ slug: 'client', resourceGroup: null }),
      ],
    });
    const nodes = [node('app', 100), node('db', 50), node('client', 0)];

    expect(computeResourceGroupRollup(resolved, nodes)).toEqual([
      { key: 'rg-app', monthly: 150 },
      { key: null, monthly: 0 },
    ]);
  });

  it('ignores nodes that reference a slug not present in resolved.resources', () => {
    const resolved = makeResolvedTopology({ resources: [] });
    expect(computeResourceGroupRollup(resolved, [node('ghost', 10)])).toEqual([{ key: null, monthly: 10 }]);
  });
});
