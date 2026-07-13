import { describe, expect, it } from 'vitest';
import { COST_SCHEMA_PACKAGE } from '@workspec/cost-schema';
import { COST_PROVIDER_PACKAGE } from './index.js';

describe('@workspec/cost-provider', () => {
  it('exports its package identity', () => {
    expect(COST_PROVIDER_PACKAGE).toBe('@workspec/cost-provider');
  });

  it('can import its cost-schema dependency (proves alias + references wiring)', () => {
    expect(COST_SCHEMA_PACKAGE).toBe('@workspec/cost-schema');
  });
});
