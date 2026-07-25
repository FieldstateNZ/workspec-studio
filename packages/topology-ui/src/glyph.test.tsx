import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Glyph } from './glyph.js';

describe('Glyph', () => {
  it('renders an accessible, hidden SVG at the requested size', () => {
    const { container } = render(<Glyph kind="compute" size={24} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '24');
    expect(svg).toHaveAttribute('height', '24');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });

  it('draws a distinct path for every one of the design\'s twelve kinds', () => {
    const kinds = [
      'client',
      'gateway',
      'compute',
      'function',
      'cache',
      'database',
      'endpoint',
      'identity',
      'vnet',
      'resource-group',
      'monitor',
      'subnet',
    ] as const;
    const shapes = kinds.map((kind) => {
      const { container } = render(<Glyph kind={kind} />);
      return container.querySelector('svg')?.innerHTML;
    });
    expect(new Set(shapes).size).toBe(kinds.length);
  });

  it('draws its own distinct glyph for edge (Front Door) — not the design\'s glyph set, but not a crash either', () => {
    const { container } = render(<Glyph kind="edge" />);
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('falls back to the compute glyph for a schema kind outside this file\'s map', () => {
    const computeRender = render(<Glyph kind="compute" />);
    const storageRender = render(<Glyph kind="storage" />);
    expect(storageRender.container.querySelector('svg')?.innerHTML).toBe(
      computeRender.container.querySelector('svg')?.innerHTML,
    );
  });
});
