import { describe, expect, it } from 'vitest';
import { COST_SCHEMA_PACKAGE } from '@workspec/cost-schema';
import { CLOUD_PROVIDER_METHODS, COST_PROVIDER_PACKAGE, createMemoryProvider } from './index.js';

describe('@workspec/cost-provider', () => {
  it('exports its package identity', () => {
    expect(COST_PROVIDER_PACKAGE).toBe('@workspec/cost-provider');
  });

  it('can import its cost-schema dependency (proves alias + references wiring)', () => {
    expect(COST_SCHEMA_PACKAGE).toBe('@workspec/cost-schema');
  });

  it('exports a real provider port and memory double (C3: no longer just the identity constant)', () => {
    expect(CLOUD_PROVIDER_METHODS).toEqual(['fetchInventory', 'fetchSpend', 'applyTags', 'verifyBaseline']);
    expect(typeof createMemoryProvider).toBe('function');
  });
});
