import { describe, expect, it } from 'vitest';
import { contentBounds } from './content-bounds.js';

describe('contentBounds', () => {
  it('returns a fallback canvas size for an empty node set', () => {
    expect(contentBounds([])).toEqual({ minX: 0, minY: 0, maxX: 400, maxY: 200, width: 400, height: 200 });
  });

  it('computes padded bounds around a single node', () => {
    const bounds = contentBounds([{ x: 100, y: 50, width: 300, height: 110 }], 20);
    expect(bounds).toEqual({ minX: 80, minY: 30, maxX: 420, maxY: 180, width: 340, height: 150 });
  });

  it('spans the union of multiple nodes', () => {
    const bounds = contentBounds(
      [
        { x: 0, y: 0, width: 100, height: 50 },
        { x: 500, y: 300, width: 100, height: 50 },
      ],
      0,
    );
    expect(bounds).toEqual({ minX: 0, minY: 0, maxX: 600, maxY: 350, width: 600, height: 350 });
  });
});
