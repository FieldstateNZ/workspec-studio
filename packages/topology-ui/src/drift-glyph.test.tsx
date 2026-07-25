import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DRIFT_CLASSES } from '@workspec/topology-recon';
import { DriftGlyph } from './drift-glyph.js';

describe('DriftGlyph', () => {
  it('renders an accessible, hidden SVG at the requested size', () => {
    const { container } = render(<DriftGlyph drift="phantom" size={24} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '24');
    expect(svg).toHaveAttribute('height', '24');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });

  it('draws a distinct shape for every one of the four real recon drift classes — colour-blind-safe by construction', () => {
    const shapes = DRIFT_CLASSES.map((cls) => {
      const { container } = render(<DriftGlyph drift={cls} />);
      return container.querySelector('svg')?.innerHTML;
    });
    expect(new Set(shapes).size).toBe(DRIFT_CLASSES.length);
  });

  it('phantom is a dashed shape (a distinct PATTERN, not just a distinct outline)', () => {
    const { container } = render(<DriftGlyph drift="phantom" />);
    const dashed = container.querySelector('[stroke-dasharray]');
    expect(dashed).not.toBeNull();
  });

  it('orphan is a dashed/dotted circle', () => {
    const { container } = render(<DriftGlyph drift="orphan" />);
    const circle = container.querySelector('circle[stroke-dasharray]');
    expect(circle).not.toBeNull();
  });
});
