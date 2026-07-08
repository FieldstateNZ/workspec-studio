import { describe, expect, it } from 'vitest';
import { diagramEdgeFactory } from '../../../test/helpers/factories.js';
import { DiagramEdge } from './diagram-edge.js';

describe('DiagramEdge', () => {
  it('accepts a minimal edge', () => {
    const result = DiagramEdge.safeParse(diagramEdgeFactory());
    expect(result.success).toBe(true);
  });

  it('accepts label, lens, and category together', () => {
    const result = DiagramEdge.safeParse(
      diagramEdgeFactory({ label: 'designs systems in', lens: 'both', category: 'identity' }),
    );
    expect(result.success).toBe(true);
  });

  it.each(['logical', 'deployment', 'both'] as const)('accepts lens "%s"', (lens) => {
    const result = DiagramEdge.safeParse(diagramEdgeFactory({ lens }));
    expect(result.success).toBe(true);
  });

  it('rejects an unknown lens value', () => {
    const result = DiagramEdge.safeParse({ ...diagramEdgeFactory(), lens: 'runtime' });
    expect(result.success).toBe(false);
  });

  it('rejects a missing `to`', () => {
    const { from } = diagramEdgeFactory();
    const result = DiagramEdge.safeParse({ from });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === 'to')).toBe(true);
    }
  });

  it('rejects a missing `from`', () => {
    const { to } = diagramEdgeFactory();
    const result = DiagramEdge.safeParse({ to });
    expect(result.success).toBe(false);
  });
});
