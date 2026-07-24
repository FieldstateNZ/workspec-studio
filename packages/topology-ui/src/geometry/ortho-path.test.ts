import { describe, expect, it } from 'vitest';
import { orthoPath } from './ortho-path.js';

describe('orthoPath', () => {
  it('routes horizontally when the horizontal separation dominates', () => {
    const a = { x: 0, y: 0, width: 100, height: 50 };
    const b = { x: 200, y: 0, width: 100, height: 50 };
    const d = orthoPath(a, b);
    // Exit right edge of a (x=100,y=25), enter left edge of b (x=200,y=25).
    expect(d).toBe('M 100.0 25.0 L 150.0 25.0 L 150.0 25.0 L 200.0 25.0');
  });

  it('routes vertically when the vertical separation dominates', () => {
    const a = { x: 0, y: 0, width: 100, height: 50 };
    const b = { x: 0, y: 200, width: 100, height: 50 };
    const d = orthoPath(a, b);
    // Exit bottom edge of a (y=50), enter top edge of b (y=200).
    expect(d).toBe('M 50.0 50.0 L 50.0 125.0 L 50.0 125.0 L 50.0 200.0');
  });

  it('forces vertical routing when options.vertical is set, even for a horizontally-dominant pair', () => {
    const a = { x: 0, y: 0, width: 100, height: 50 };
    const b = { x: 300, y: 10, width: 100, height: 50 };
    const d = orthoPath(a, b, { vertical: true });
    expect(d.startsWith('M 50.0 50.0')).toBe(true);
  });

  it('applies sOff/tOff perpendicular offsets', () => {
    const a = { x: 0, y: 0, width: 100, height: 50 };
    const b = { x: 200, y: 0, width: 100, height: 50 };
    const d = orthoPath(a, b, { sOff: 5, tOff: -5 });
    expect(d).toBe('M 100.0 30.0 L 150.0 30.0 L 150.0 20.0 L 200.0 20.0');
  });
});
