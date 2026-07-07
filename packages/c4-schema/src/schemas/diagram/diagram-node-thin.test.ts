import { describe, expect, it } from 'vitest';
import { ThinDiagramNode } from './diagram-node-thin.js';

describe('ThinDiagramNode', () => {
  it('accepts a bare-slug reference', () => {
    const result = ThinDiagramNode.safeParse({ slug: 'architect' });
    expect(result.success).toBe(true);
  });

  it('accepts a bare-slug reference with a pinned position', () => {
    const result = ThinDiagramNode.safeParse({ slug: 'architect', position: { x: 10, y: 20 } });
    expect(result.success).toBe(true);
  });

  it.each(['actor', 'system', 'external-system', 'container', 'component', 'database', 'queue', 'domain', 'feature', 'class', 'interface', 'function'])(
    'accepts a typed-ref for kind "%s"',
    (kind) => {
      const result = ThinDiagramNode.safeParse({ [kind]: 'some-slug' });
      expect(result.success).toBe(true);
    },
  );

  it('rejects a node with two typed-ref keys (ambiguous kind)', () => {
    const result = ThinDiagramNode.safeParse({ component: 'diagram-editor', container: 'api-server' });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown ref kind', () => {
    const result = ThinDiagramNode.safeParse({ widget: 'some-slug' });
    expect(result.success).toBe(false);
  });

  it('rejects a node with neither slug nor a typed-ref key', () => {
    const result = ThinDiagramNode.safeParse({ position: { x: 0, y: 0 } });
    expect(result.success).toBe(false);
  });
});
