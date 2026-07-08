import { describe, expect, it } from 'vitest';
import type { PositionedDiagram, PositionedEdge, PositionedNode } from '@workspec/c4-layout';
import { Spec } from '@workspec/c4-schema';
import { renderSvg } from './render-svg.js';

function node(
  overrides: Partial<PositionedNode> & Pick<PositionedNode, 'nodeId' | 'x' | 'y'>,
): PositionedNode {
  return {
    slug: overrides.nodeId,
    kind: 'container',
    title: overrides.nodeId,
    description: null,
    technology: null,
    tags: [],
    position: null,
    injected: false,
    dangling: false,
    width: 300,
    height: 110,
    pinned: false,
    ...overrides,
  };
}

function edge(
  overrides: Partial<PositionedEdge> & Pick<PositionedEdge, 'from' | 'to' | 'route'>,
): PositionedEdge {
  return { label: null, category: null, lens: null, dangling: false, ...overrides };
}

const DIAGRAM: PositionedDiagram = {
  nodes: [
    node({
      nodeId: 'architect',
      x: 40,
      y: 40,
      kind: 'actor',
      title: 'Architect',
      description: 'Designs systems.',
      tags: ['human'],
    }),
    node({
      nodeId: 'ledger',
      x: 420,
      y: 40,
      kind: 'system',
      title: 'Ledger',
      technology: 'Node.js',
    }),
    node({
      nodeId: 'gateway',
      x: 420,
      y: 260,
      kind: 'external-system',
      title: 'Payment Gateway',
    }),
    node({
      nodeId: 'db',
      x: 800,
      y: 40,
      kind: 'database',
      title: 'Primary DB',
      technology: 'PostgreSQL',
    }),
    node({
      nodeId: 'queue',
      x: 800,
      y: 260,
      kind: 'queue',
      title: 'Event Bus',
    }),
  ],
  edges: [
    edge({
      from: 'architect',
      to: 'ledger',
      label: 'designs',
      category: 'identity',
      route: [
        { x: 340, y: 95 },
        { x: 420, y: 95 },
      ],
    }),
    edge({
      from: 'ledger',
      to: 'gateway',
      label: 'settles invoices via',
      category: 'data',
      route: [
        { x: 570, y: 150 },
        { x: 570, y: 260 },
        { x: 570, y: 315 },
        { x: 570, y: 315 },
      ],
    }),
  ],
};

describe('renderSvg', () => {
  it('is deterministic — two runs produce byte-identical output', () => {
    expect(renderSvg(DIAGRAM)).toBe(renderSvg(DIAGRAM));
  });

  it('produces valid, parseable XML with no React artifacts', () => {
    const svg = renderSvg(DIAGRAM);
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    expect(doc.querySelector('parsererror')).toBeNull();
    expect(doc.documentElement.tagName).toBe('svg');
    expect(svg).not.toContain('data-reactroot');
    expect(svg).not.toMatch(/react-/i);
  });

  it('embeds a resolved theme colour literally (no CSS custom properties in the output)', () => {
    const svg = renderSvg(DIAGRAM, { theme: 'dark' });
    expect(svg).not.toContain('var(--');
  });

  it('escapes XML-significant characters in text content', () => {
    const withSpecialChars: PositionedDiagram = {
      nodes: [node({ nodeId: 'x', x: 0, y: 0, title: 'A & B <script>' })],
      edges: [],
    };
    const svg = renderSvg(withSpecialChars);
    expect(svg).toContain('A &amp; B &lt;script&gt;');
    expect(svg).not.toContain('<script>');
  });

  it('honours a spec.yaml accent override', () => {
    const spec = Spec.parse({ elements: { actor: { accent: '#123456' } } });
    const svg = renderSvg(DIAGRAM, { spec });
    expect(svg).toContain('#123456');
  });

  it('matches the committed golden snapshot', () => {
    expect(renderSvg(DIAGRAM, { title: 'Representative diagram' })).toMatchSnapshot();
  });
});
