import { describe, expect, it } from 'vitest';
import { slugify } from './slugify.js';

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Dev Lead')).toBe('dev-lead');
  });

  it('collapses runs of non-alphanumeric characters to a single hyphen', () => {
    expect(slugify('foo   bar_baz!!qux')).toBe('foo-bar-baz-qux');
  });

  it('trims leading and trailing hyphens', () => {
    expect(slugify('--hello--')).toBe('hello');
  });

  it('caps at 64 characters, applied after trimming', () => {
    const input = 'a'.repeat(100);
    expect(slugify(input)).toBe('a'.repeat(64));
  });

  it('keeps a trailing hyphen produced by the 64-char cut (no second trim)', () => {
    // 63 letters + a hyphen lands the cut exactly on the hyphen at index 64.
    const input = `${'a'.repeat(63)}-bbbb`;
    const result = slugify(input);
    expect(result).toBe(`${'a'.repeat(63)}-`);
    expect(result).toHaveLength(64);
  });
});
