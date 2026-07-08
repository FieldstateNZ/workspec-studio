import { describe, expect, it } from 'vitest';
import { slugFromPath } from './slug-from-path.js';

describe('slugFromPath', () => {
  it('recovers the slug from a nested artifact path', () => {
    expect(slugFromPath('.workspec/actors/architect.yaml')).toBe('architect');
  });

  it('recovers the slug from a layout path', () => {
    expect(slugFromPath('.workspec/diagrams/.layout/system-context.yaml')).toBe('system-context');
  });

  it('returns null for a .yml path (never valid)', () => {
    expect(slugFromPath('.workspec/actors/architect.yml')).toBeNull();
  });

  it('returns null for a path with no filename', () => {
    expect(slugFromPath('.workspec/actors/.yaml')).toBeNull();
  });

  it('recovers the slug from a bare filename with no directory', () => {
    expect(slugFromPath('architect.yaml')).toBe('architect');
  });
});
