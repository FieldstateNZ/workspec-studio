import { describe, expect, it } from 'vitest';
import { thinDiagramFactory } from '../../../test/helpers/factories.js';
import { Diagram } from './diagram.js';

describe('Diagram (thin | fat union)', () => {
  it('accepts a thin diagram', () => {
    const result = Diagram.safeParse(thinDiagramFactory());
    expect(result.success).toBe(true);
  });

  it('accepts a fat diagram', () => {
    const result = Diagram.safeParse({
      title: 'Container',
      type: 'c4-container',
      nodes: [{ id: 'api', type: 'container', label: 'API Server' }],
      edges: [],
    });
    expect(result.success).toBe(true);
  });

  it('rejects something that is neither shape', () => {
    const result = Diagram.safeParse({ title: 'Container', type: 'c4-container' });
    expect(result.success).toBe(false);
  });
});
