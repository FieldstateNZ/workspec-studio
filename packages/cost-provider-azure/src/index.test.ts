import { describe, expect, it } from 'vitest';
import { COST_PROVIDER_PACKAGE } from '@workspec/cost-provider';
import { COST_SCHEMA_PACKAGE } from '@workspec/cost-schema';
import { COST_PROVIDER_AZURE_PACKAGE } from './index.js';

describe('@workspec/cost-provider-azure', () => {
  it('exports its package identity', () => {
    expect(COST_PROVIDER_AZURE_PACKAGE).toBe('@workspec/cost-provider-azure');
  });

  it('can import its cost-provider and cost-schema dependencies (proves alias + references wiring)', () => {
    expect(COST_PROVIDER_PACKAGE).toBe('@workspec/cost-provider');
    expect(COST_SCHEMA_PACKAGE).toBe('@workspec/cost-schema');
  });
});
