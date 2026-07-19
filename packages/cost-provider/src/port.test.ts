import { describe, expect, it } from 'vitest';
import { CLOUD_PROVIDER_METHODS, createMemoryProvider } from './index.js';

// Port-shape test, mirroring `@workspec/decision-schema`'s
// `DECISION_REPOSITORY_METHODS` test: the port is deliberately exactly four
// methods, and this pins that shape at both the constant and a real
// implementation.

describe('CLOUD_PROVIDER_METHODS', () => {
  it('is exactly the four port methods', () => {
    expect(CLOUD_PROVIDER_METHODS).toEqual(['fetchInventory', 'fetchSpend', 'applyTags', 'verifyBaseline']);
  });

  it('every named method exists as a function on a real CloudProviderPort implementation', () => {
    const provider = createMemoryProvider({
      inventory: {
        apiVersion: 'workspec.io/v1alpha1',
        kind: 'Inventory',
        metadata: { slug: 'port-shape-check' },
        spec: { asOf: '2024-01-01T00:00:00.000Z', scope: { subscriptions: ['sub-1'] }, resources: [] },
      },
    });

    for (const method of CLOUD_PROVIDER_METHODS) {
      expect(typeof provider[method]).toBe('function');
    }
  });
});
