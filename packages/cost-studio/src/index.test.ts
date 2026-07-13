import { describe, expect, it } from 'vitest';
import { COST_STUDIO_DEPENDENCIES, COST_STUDIO_PACKAGE } from './index.js';

describe('@workspec/cost-studio', () => {
  it('exports its package identity', () => {
    expect(COST_STUDIO_PACKAGE).toBe('@workspec/cost-studio');
  });

  it('can import cost-ui, cost-engine, cost-provider, and cost-schema (proves alias + references wiring)', () => {
    expect(COST_STUDIO_DEPENDENCIES).toEqual([
      '@workspec/cost-ui',
      '@workspec/cost-engine',
      '@workspec/cost-provider',
      '@workspec/cost-schema',
    ]);
  });
});
