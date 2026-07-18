import { describe, expect, it } from 'vitest';
import { sortJsonKeys } from './sort-json-keys.js';

describe('sortJsonKeys', () => {
  it('sorts top-level keys alphabetically', () => {
    expect(sortJsonKeys({ b: 1, a: 2 })).toEqual({ a: 2, b: 1 });
    expect(Object.keys(sortJsonKeys({ b: 1, a: 2 }) as object)).toEqual(['a', 'b']);
  });

  it('sorts keys recursively through nested objects', () => {
    const result = sortJsonKeys({ z: { d: 1, c: 2 }, a: 1 }) as {
      a: number;
      z: Record<string, number>;
    };
    expect(Object.keys(result)).toEqual(['a', 'z']);
    expect(Object.keys(result.z)).toEqual(['c', 'd']);
  });

  it('leaves array order untouched', () => {
    const result = sortJsonKeys({ list: [{ b: 1, a: 2 }, { d: 1, c: 2 }] }) as {
      list: Record<string, number>[];
    };
    expect(result.list.map((item) => Object.keys(item))).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('leaves primitives untouched', () => {
    expect(sortJsonKeys('hello')).toBe('hello');
    expect(sortJsonKeys(42)).toBe(42);
    expect(sortJsonKeys(null)).toBeNull();
  });
});
