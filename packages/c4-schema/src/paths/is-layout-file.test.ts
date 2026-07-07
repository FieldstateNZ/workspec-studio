import { describe, expect, it } from 'vitest';
import { isLayoutFile } from './is-layout-file.js';
import { layoutPathFor } from './layout-path-for.js';

describe('isLayoutFile', () => {
  it('is true for a path built by layoutPathFor', () => {
    expect(isLayoutFile(layoutPathFor('system-context'))).toBe(true);
  });

  it('is false for a sibling diagram artifact path (same directory, no .layout/ segment)', () => {
    expect(isLayoutFile('.workspec/diagrams/system-context.yaml')).toBe(false);
  });

  it('is false for a non-diagram artifact path', () => {
    expect(isLayoutFile('.workspec/actors/architect.yaml')).toBe(false);
  });

  it('is false for a .yml file even if otherwise under .layout/', () => {
    expect(isLayoutFile('.workspec/diagrams/.layout/system-context.yml')).toBe(false);
  });
});
