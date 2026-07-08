import { describe, expect, it } from 'vitest';
import { c4ElementFactory } from '../../test/helpers/factories.js';
import { C4Element } from './c4-element.js';

describe('C4Element (container/component/database/queue)', () => {
  it.each(['container', 'component', 'database', 'queue'])(
    'accepts a minimal %s element',
    (type) => {
      const result = C4Element.safeParse(c4ElementFactory({ type }));
      expect(result.success).toBe(true);
    },
  );

  it('accepts an optional technology field', () => {
    const result = C4Element.safeParse(c4ElementFactory({ technology: 'PostgreSQL' }));
    expect(result.success).toBe(true);
  });

  it('rejects a missing type — unlike actor/system, type is required here', () => {
    const { title, description } = c4ElementFactory();
    const result = C4Element.safeParse({ title, description });
    expect(result.success).toBe(false);
  });

  it('rejects a missing description', () => {
    const { type, title } = c4ElementFactory();
    const result = C4Element.safeParse({ type, title });
    expect(result.success).toBe(false);
  });
});
