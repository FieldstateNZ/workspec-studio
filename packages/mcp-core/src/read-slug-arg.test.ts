import { describe, expect, it } from 'vitest';
import { InvalidSlugError, readSlugArg } from './read-slug-arg.js';

describe('readSlugArg', () => {
  it('accepts a well-shaped single-segment slug', () => {
    expect(readSlugArg({ env: 'prod' }, 'env')).toBe('prod');
  });

  it('accepts a well-shaped multi-segment slug with digits', () => {
    expect(readSlugArg({ env: 'my-env-2' }, 'env')).toBe('my-env-2');
  });

  it('accepts a 64-character slug (the maximum length, not one past it)', () => {
    const value = 'a'.repeat(64);
    expect(readSlugArg({ env: value }, 'env')).toBe(value);
  });

  it.each([
    ['a traversal segment', '../etc'],
    ['a bare traversal', '..'],
    ['a forward-slash path', 'a/b'],
    ['a backslash path', String.raw`a\b`],
    ['uppercase letters', 'UPPER'],
    ['a leading hyphen', '-lead'],
    ['a trailing hyphen', 'trail-'],
    ['a doubled hyphen', 'a--b'],
    ['the empty string', ''],
    ['a 65-character string', 'a'.repeat(65)],
  ])('throws InvalidSlugError for %s', (_label, value) => {
    expect(() => readSlugArg({ env: value }, 'env')).toThrow(InvalidSlugError);
  });

  it('InvalidSlugError names only the argument, not the offending value', () => {
    try {
      readSlugArg({ env: '../../etc' }, 'env');
      expect.unreachable('expected readSlugArg to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidSlugError);
      expect((error as Error).message).toBe('argument "env" is not a valid slug');
      expect((error as Error).message).not.toContain('../../etc');
    }
  });

  it('throws a plain Error (not InvalidSlugError) when the key is missing', () => {
    expect(() => readSlugArg({}, 'env')).toThrow('missing required argument "env"');
    try {
      readSlugArg({}, 'env');
      expect.unreachable('expected readSlugArg to throw');
    } catch (error) {
      expect(error).not.toBeInstanceOf(InvalidSlugError);
    }
  });

  it('throws a plain Error (not InvalidSlugError) when the value is not a string', () => {
    expect(() => readSlugArg({ env: 123 }, 'env')).toThrow('argument "env" must be a string');
    try {
      readSlugArg({ env: 123 }, 'env');
      expect.unreachable('expected readSlugArg to throw');
    } catch (error) {
      expect(error).not.toBeInstanceOf(InvalidSlugError);
    }
  });
});
