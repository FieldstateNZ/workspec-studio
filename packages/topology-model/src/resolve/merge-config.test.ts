import { describe, expect, it } from 'vitest';
import { mergeConfig } from './merge-config.js';

describe('mergeConfig', () => {
  it('returns null when both base and patch are absent', () => {
    expect(mergeConfig(undefined, undefined)).toBeNull();
  });

  it('returns the base verbatim when there is no patch', () => {
    expect(mergeConfig({ tier: 'P1v3' }, undefined)).toEqual({ tier: 'P1v3' });
  });

  it('returns the patch verbatim when there is no base', () => {
    expect(mergeConfig(undefined, { sku: 'Basic' })).toEqual({ sku: 'Basic' });
  });

  it('a patch key not present on the base is added', () => {
    expect(mergeConfig({ tier: 'P1v3' }, { sku: 'Basic' })).toEqual({ tier: 'P1v3', sku: 'Basic' });
  });

  it('a patch key present on the base replaces it', () => {
    expect(mergeConfig({ tier: 'P1v3' }, { tier: 'P2v3' })).toEqual({ tier: 'P2v3' });
  });

  it('REVERT-CHECK: a nested object in the patch replaces the base object wholesale — NOT a deep merge', () => {
    const base = { sizing: { cpu: 2, memory: 4 } };
    const patch = { sizing: { cpu: 4 } };
    // A deep merge would produce { sizing: { cpu: 4, memory: 4 } } — this
    // asserts the frozen shallow-merge decision instead: `memory` is gone,
    // not inherited, because `sizing` itself was named in the patch.
    expect(mergeConfig(base, patch)).toEqual({ sizing: { cpu: 4 } });
  });

  it('an array in the patch replaces the base array wholesale, not element-wise', () => {
    expect(mergeConfig({ zones: ['a', 'b', 'c'] }, { zones: ['x'] })).toEqual({ zones: ['x'] });
  });
});
