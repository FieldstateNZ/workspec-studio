import { describe, expect, it } from 'vitest';
import { COST_SCHEMA_PACKAGE } from './index.js';

describe('@workspec/cost-schema', () => {
  it('exports its package identity', () => {
    expect(COST_SCHEMA_PACKAGE).toBe('@workspec/cost-schema');
  });
});
