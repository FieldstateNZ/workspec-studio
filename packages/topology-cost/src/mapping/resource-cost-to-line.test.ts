import { describe, expect, it } from 'vitest';
import { makeResolvedResource } from '../../test/helpers/resolved-topology-factory.js';
import { resourceCostToLine } from './resource-cost-to-line.js';

describe('resourceCostToLine', () => {
  it('returns null when the resource has no cost binding', () => {
    const resource = makeResolvedResource({ slug: 'no-cost' });
    expect(resourceCostToLine(resource, 'prod')).toBeNull();
  });

  it('maps a cost binding to a SkuLine keyed on envSlug', () => {
    const resource = makeResolvedResource({
      slug: 'app-service',
      name: 'Web App Service',
      cost: { sku: 'p1v3', mode: 'payg', schedule: 'always', qty: 2 },
    });

    expect(resourceCostToLine(resource, 'prod')).toEqual({
      id: 'app-service',
      label: 'Web App Service',
      flat: false,
      sku: 'p1v3',
      mode: 'payg',
      schedule: 'always',
      qty: { prod: 2 },
    });
  });

  it('carries attribution on the resource, not the line — the line is priced independently of attribution', () => {
    const resource = makeResolvedResource({
      slug: 'app-service',
      cost: {
        sku: 'p1v3',
        mode: 'payg',
        schedule: 'always',
        qty: 1,
        attribution: [{ container: 'api-server', share: 1 }],
      },
    });

    const line = resourceCostToLine(resource, 'dev');
    expect(line).not.toHaveProperty('attribution');
    expect(line?.qty).toEqual({ dev: 1 });
  });
});
