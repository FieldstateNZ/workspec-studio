import { describe, expect, it } from 'vitest';
import { diffConfig } from './diff-config.js';

describe('diffConfig', () => {
  it('returns nothing when both bags are null', () => {
    expect(diffConfig(null, null)).toEqual([]);
  });

  it('reports a key present on only one side, in either direction', () => {
    expect(diffConfig({ tier: 'P1v3' }, null)).toEqual([
      { key: 'tier', authored: 'P1v3', actual: undefined },
    ]);
    expect(diffConfig(null, { tier: 'P0v3' })).toEqual([
      { key: 'tier', authored: undefined, actual: 'P0v3' },
    ]);
  });

  it('reports a shallow value change and omits equal keys', () => {
    const diff = diffConfig(
      { tier: 'P1v3', zoneRedundant: true },
      { tier: 'P0v3', zoneRedundant: true },
    );
    expect(diff).toEqual([{ key: 'tier', authored: 'P1v3', actual: 'P0v3' }]);
  });

  it('compares nested values deeply, not by reference', () => {
    const diff = diffConfig({ scale: { min: 1, max: 3 } }, { scale: { min: 1, max: 3 } });
    expect(diff).toEqual([]);
  });

  it('sorts differing keys alphabetically for deterministic output', () => {
    const diff = diffConfig({ zone: 'a', alpha: 'a' }, { zone: 'b', alpha: 'b' });
    expect(diff.map((d) => d.key)).toEqual(['alpha', 'zone']);
  });
});
