import { describe, expect, it } from 'vitest';
import { diagramEdgeFactory, thinDiagramFactory } from '../../../test/helpers/factories.js';
import { ThinDiagram } from './diagram-thin.js';

describe('ThinDiagram', () => {
  it('accepts an empty diagram (no nodes, no edges)', () => {
    const result = ThinDiagram.safeParse(thinDiagramFactory());
    expect(result.success).toBe(true);
  });

  it('accepts an optional top-level source field', () => {
    const result = ThinDiagram.safeParse(
      thinDiagramFactory({ source: 'generated from repo scan' }),
    );
    expect(result.success).toBe(true);
  });

  it('accepts a diagram with mixed bare-slug and typed-ref nodes', () => {
    const result = ThinDiagram.safeParse(
      thinDiagramFactory({
        nodes: [{ slug: 'architect' }, { 'external-system': 'payment-gateway' }],
        edges: [diagramEdgeFactory()],
      }),
    );
    expect(result.success).toBe(true);
  });

  it('accepts any free-string diagram type (known set is documentation only)', () => {
    const result = ThinDiagram.safeParse(thinDiagramFactory({ type: 'deployment' }));
    expect(result.success).toBe(true);
  });

  it('rejects a missing title', () => {
    const { type, nodes, edges } = thinDiagramFactory();
    const result = ThinDiagram.safeParse({ type, nodes, edges });
    expect(result.success).toBe(false);
  });

  it('rejects a missing nodes array', () => {
    const { title, type, edges } = thinDiagramFactory();
    const result = ThinDiagram.safeParse({ title, type, edges });
    expect(result.success).toBe(false);
  });
});
