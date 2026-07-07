import { describe, expect, it } from 'vitest';
import { layoutPathFor } from './layout-path-for.js';

describe('layoutPathFor', () => {
  it('builds a path nested under diagrams/.layout/', () => {
    expect(layoutPathFor('system-context')).toBe('.workspec/diagrams/.layout/system-context.yaml');
  });
});
