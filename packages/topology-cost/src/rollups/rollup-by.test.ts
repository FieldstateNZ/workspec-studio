import { describe, expect, it } from 'vitest';
import { rollupBy } from './rollup-by.js';

describe('rollupBy', () => {
  it('sums values into buckets keyed by keyFn', () => {
    const items = [{ group: 'a', value: 10 }, { group: 'b', value: 5 }, { group: 'a', value: 3 }];

    const result = rollupBy(items, (i) => i.group, (i) => i.value);

    expect(result).toEqual([
      { key: 'a', monthly: 13 },
      { key: 'b', monthly: 5 },
    ]);
  });

  it('sorts keys alphabetically and puts the null bucket last', () => {
    const items = [{ group: 'z', value: 1 }, { group: null, value: 2 }, { group: 'a', value: 3 }];

    const result = rollupBy(items, (i) => i.group, (i) => i.value);

    expect(result.map((r) => r.key)).toEqual(['a', 'z', null]);
  });

  it('returns an empty array for an empty input', () => {
    expect(rollupBy([], () => null, () => 0)).toEqual([]);
  });
});
