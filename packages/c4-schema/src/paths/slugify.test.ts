import { describe, expect, it } from 'vitest';
import { slugify } from './slugify.js';

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Diagram Editor')).toBe('diagram-editor');
  });

  it('collapses runs of non-alphanumeric characters to one hyphen', () => {
    expect(slugify('Payment   Gateway!!')).toBe('payment-gateway');
  });

  it('trims leading and trailing hyphens', () => {
    expect(slugify('---Architect---')).toBe('architect');
  });

  it('caps at 64 characters', () => {
    const long = 'a'.repeat(100);
    expect(slugify(long)).toHaveLength(64);
  });

  it('keeps a trailing hyphen when the 64-char cut lands on one (Enterprise-identical)', () => {
    // 65-char post-trim string whose 64-char prefix ends in '-': Enterprise
    // slices AFTER the trim with no second trim, so the '-' survives.
    const input = `${'a'.repeat(63)} b`;
    expect(slugify(input)).toBe(`${'a'.repeat(63)}-`);
    expect(slugify(input)).toHaveLength(64);
  });

  it('is idempotent on an already-valid slug', () => {
    expect(slugify('already-a-slug')).toBe('already-a-slug');
  });
});
