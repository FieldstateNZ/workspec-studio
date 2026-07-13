import { describe, expect, it } from 'vitest';
import { COST_SCHEMA_PACKAGE, InventoryArtifact, isInventoryFile } from './index.js';

describe('@workspec/cost-schema', () => {
  it('exports its package identity', () => {
    expect(COST_SCHEMA_PACKAGE).toBe('@workspec/cost-schema');
  });

  it('exports real schemas and constants (C1: no longer just the identity constant)', () => {
    expect(isInventoryFile('foo.inventory.yaml')).toBe(true);
    expect(InventoryArtifact).toBeDefined();
  });
});
