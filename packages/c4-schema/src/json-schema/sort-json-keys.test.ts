import { describe, expect, it } from 'vitest';
import { sortJsonKeys } from './sort-json-keys.js';

describe('sortJsonKeys', () => {
  it('sorts object keys alphabetically, recursively', () => {
    const result = sortJsonKeys({ b: 1, a: { d: 1, c: 2 } });
    expect(Object.keys(result as object)).toEqual(['a', 'b']);
    expect(Object.keys((result as { a: object }).a)).toEqual(['c', 'd']);
  });

  it('leaves array order untouched', () => {
    const result = sortJsonKeys({ list: ['b', 'a', 'c'] }) as { list: string[] };
    expect(result.list).toEqual(['b', 'a', 'c']);
  });

  it('sorts objects nested inside arrays', () => {
    const result = sortJsonKeys({ list: [{ b: 1, a: 2 }] }) as { list: [Record<string, number>] };
    expect(Object.keys(result.list[0])).toEqual(['a', 'b']);
  });

  it('passes primitives through unchanged', () => {
    expect(sortJsonKeys('x')).toBe('x');
    expect(sortJsonKeys(1)).toBe(1);
    expect(sortJsonKeys(null)).toBeNull();
  });
});
