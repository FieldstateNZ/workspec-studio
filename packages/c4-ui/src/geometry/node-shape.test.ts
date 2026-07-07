import { describe, expect, it } from 'vitest';
import { BOX_CORNER_RADIUS, nodeShapeGeometry } from './node-shape.js';

const RECT = { x: 10, y: 20, width: 300, height: 110 };

describe('nodeShapeGeometry', () => {
  it('box renders as a plain rounded rect (no path needed)', () => {
    expect(nodeShapeGeometry(RECT, 'box')).toEqual({ kind: 'rect', rx: BOX_CORNER_RADIUS, ry: BOX_CORNER_RADIUS });
  });

  it('pill renders as a fully-rounded (stadium) rect: rx/ry = half the height', () => {
    expect(nodeShapeGeometry(RECT, 'pill')).toEqual({ kind: 'rect', rx: 55, ry: 55 });
  });

  it('cylinder renders as a closed outline path plus a lid-seam decoration', () => {
    const geometry = nodeShapeGeometry(RECT, 'cylinder');
    expect(geometry.kind).toBe('path');
    if (geometry.kind !== 'path') throw new Error('unreachable');
    expect(geometry.outline.startsWith('M ')).toBe(true);
    expect(geometry.outline.endsWith('Z')).toBe(true);
    expect(geometry.decoration).toBeDefined();
  });

  it('hexagon renders as a closed outline path with no decoration', () => {
    const geometry = nodeShapeGeometry(RECT, 'hexagon');
    expect(geometry.kind).toBe('path');
    if (geometry.kind !== 'path') throw new Error('unreachable');
    expect(geometry.outline.endsWith('Z')).toBe(true);
    expect(geometry.decoration).toBeUndefined();
  });

  it('is deterministic — identical input produces identical geometry', () => {
    expect(nodeShapeGeometry(RECT, 'cylinder')).toEqual(nodeShapeGeometry(RECT, 'cylinder'));
  });
});
