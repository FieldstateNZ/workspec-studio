import { describe, expect, it } from 'vitest';
import { COST_PROVIDER_PACKAGE } from '@workspec/cost-provider';
import { COST_SCHEMA_PACKAGE } from '@workspec/cost-schema';
import { COST_ENGINE_PACKAGE } from './index.js';

describe('@workspec/cost-engine', () => {
  it('exports its package identity', () => {
    expect(COST_ENGINE_PACKAGE).toBe('@workspec/cost-engine');
  });

  it('can import its cost-provider and cost-schema dependencies (proves alias + references wiring)', () => {
    expect(COST_PROVIDER_PACKAGE).toBe('@workspec/cost-provider');
    expect(COST_SCHEMA_PACKAGE).toBe('@workspec/cost-schema');
  });
});
