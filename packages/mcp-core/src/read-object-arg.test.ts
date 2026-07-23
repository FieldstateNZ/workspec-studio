import { describe, expect, it } from 'vitest';
import { readObjectArg } from './read-object-arg.js';

describe('readObjectArg', () => {
  it('returns the raw value for a present key, unnarrowed', () => {
    const value = { foo: 'bar' };
    expect(readObjectArg({ catalog: value }, 'catalog')).toBe(value);
  });

  it('returns a non-object value as-is (narrowing is the caller schema\'s job)', () => {
    expect(readObjectArg({ catalog: 'not-an-object' }, 'catalog')).toBe('not-an-object');
  });

  it('throws when args is not an object', () => {
    expect(() => readObjectArg('nope', 'catalog')).toThrow('missing required argument "catalog"');
  });

  it('throws when the key is missing', () => {
    expect(() => readObjectArg({}, 'catalog')).toThrow('missing required argument "catalog"');
  });
});
