import { describe, expect, it } from 'vitest';
import { toSlug } from './slug.js';

describe('toSlug', () => {
  it('lowercases and hyphenates', () => {
    expect(toSlug('Web App Service')).toBe('web-app-service');
  });

  it('collapses runs of non-alphanumeric characters to a single hyphen', () => {
    expect(toSlug('core--vnet__prod')).toBe('core-vnet-prod');
  });

  it('trims leading and trailing hyphens', () => {
    expect(toSlug('-front-door-')).toBe('front-door');
  });

  it('caps at 64 characters', () => {
    const long = 'a'.repeat(100);
    expect(toSlug(long)).toHaveLength(64);
  });
});
