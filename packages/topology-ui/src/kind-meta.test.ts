import { describe, expect, it } from 'vitest';
import type { ResourceKindType } from '@workspec/topology-schema';
import { RESOURCE_KINDS } from '@workspec/topology-schema';
import { boundaryAccentVar, KIND_NAME, kindColorVar, kindDisplayName } from './kind-meta.js';

describe('kindDisplayName', () => {
  it('has a label for every closed-set resource kind', () => {
    for (const kind of RESOURCE_KINDS) {
      expect(KIND_NAME[kind]).toBeTypeOf('string');
      expect(kindDisplayName(kind)).toBe(KIND_NAME[kind]);
    }
  });
});

describe('kindColorVar', () => {
  it('returns a var() token reference, never a literal colour, for every kind', () => {
    for (const kind of RESOURCE_KINDS) {
      expect(kindColorVar(kind)).toMatch(/^var\(--[a-z0-9-]+\)$/);
    }
  });

  it('falls back to the neutral token for a kind outside the design map (resource-group)', () => {
    expect(kindColorVar('resource-group')).toBe('var(--ink-soft)');
  });
});

describe('boundaryAccentVar', () => {
  it('accents vnet and resource-group boundary boxes', () => {
    expect(boundaryAccentVar('vnet')).toBe('var(--type-persona)');
    expect(boundaryAccentVar('resource-group')).toBe('var(--type-persona)');
  });

  it('keeps subnet boundary boxes neutral so they recede beneath their parent vnet', () => {
    expect(boundaryAccentVar('subnet')).toBe('var(--ink-muted)');
  });

  it('never crashes for a kind outside the three grouping kinds', () => {
    const kind: ResourceKindType = 'compute';
    expect(() => boundaryAccentVar(kind)).not.toThrow();
  });
});
