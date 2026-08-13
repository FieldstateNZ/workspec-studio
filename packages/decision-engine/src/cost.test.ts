import { describe, expect, it } from 'vitest';
import type { Catalog, LineType } from '@workspec/decision-schema';
import { lineEnvCost } from './cost.js';

const catalog = {
  apiVersion: 'workspec.io/v1alpha1',
  kind: 'Catalog',
  metadata: { slug: 'prices' },
  spec: {
    currency: 'NZD',
    pricingModes: [{ id: 'payg', label: 'PAYG', mult: 1, committed: false }],
    schedules: [{ id: 'always', label: 'Always', pct: 1 }],
    skus: [{ id: 'db', label: 'DB', family: 'database', price: 100 }],
  },
} as Catalog;

describe('lineEnvCost', () => {
  it('retains the Topology pricing kernel independently of Decision', () => {
    const line = {
      id: 'db',
      label: 'DB',
      flat: false,
      sku: 'db',
      mode: 'payg',
      schedule: 'always',
      qty: { prod: 2 },
    } as LineType;
    expect(lineEnvCost(line, 'prod', catalog)).toBe(200);
  });
});
