import { describe, expect, it } from 'vitest';
import { Slug } from './slug.js';

describe('Slug', () => {
  it('accepts a valid slug', () => {
    expect(Slug.safeParse('dev-lead').success).toBe(true);
  });

  it('rejects uppercase characters', () => {
    expect(Slug.safeParse('Dev-Lead').success).toBe(false);
  });

  it('rejects a leading or trailing hyphen', () => {
    expect(Slug.safeParse('-dev-lead').success).toBe(false);
    expect(Slug.safeParse('dev-lead-').success).toBe(false);
  });

  it('rejects a doubled hyphen', () => {
    expect(Slug.safeParse('dev--lead').success).toBe(false);
  });

  it('rejects a slug over 64 characters', () => {
    expect(Slug.safeParse('a'.repeat(65)).success).toBe(false);
  });

  it('accepts a slug at exactly 64 characters', () => {
    expect(Slug.safeParse('a'.repeat(64)).success).toBe(true);
  });
});
