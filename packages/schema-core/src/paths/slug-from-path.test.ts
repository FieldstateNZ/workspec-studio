import { describe, expect, it } from 'vitest';
import { slugFromPath } from './slug-from-path.js';

describe('slugFromPath', () => {
  it('recovers the slug from a nested path', () => {
    expect(slugFromPath('.workspec/actors/dev-lead.yaml')).toBe('dev-lead');
  });

  it('recovers the slug from a bare filename', () => {
    expect(slugFromPath('dev-lead.yaml')).toBe('dev-lead');
  });

  it('returns null for a non-.yaml path', () => {
    expect(slugFromPath('.workspec/actors/dev-lead.yml')).toBeNull();
    expect(slugFromPath('README.md')).toBeNull();
  });

  it('returns null when the slug would be empty', () => {
    expect(slugFromPath('.yaml')).toBeNull();
    expect(slugFromPath('.workspec/actors/.yaml')).toBeNull();
  });
});
