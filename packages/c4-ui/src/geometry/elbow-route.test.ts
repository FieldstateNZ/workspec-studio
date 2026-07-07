import { describe, expect, it } from 'vitest';
import { recomputeElbowRoute } from './elbow-route.js';

describe('recomputeElbowRoute', () => {
  it('LR: a straight two-point route when the rects are vertically aligned', () => {
    const from = { x: 0, y: 0, width: 100, height: 50 };
    const to = { x: 200, y: 0, width: 100, height: 50 };
    expect(recomputeElbowRoute(from, to, 'LR')).toEqual([
      { x: 100, y: 25 },
      { x: 200, y: 25 },
    ]);
  });

  it('LR: a Z-bend when the rects are not vertically aligned', () => {
    const from = { x: 0, y: 0, width: 100, height: 50 };
    const to = { x: 200, y: 100, width: 100, height: 50 };
    expect(recomputeElbowRoute(from, to, 'LR')).toEqual([
      { x: 100, y: 25 },
      { x: 150, y: 25 },
      { x: 150, y: 125 },
      { x: 200, y: 125 },
    ]);
  });

  it('TB: a straight two-point route when the rects are horizontally aligned', () => {
    const from = { x: 0, y: 0, width: 100, height: 50 };
    const to = { x: 0, y: 150, width: 100, height: 50 };
    expect(recomputeElbowRoute(from, to, 'TB')).toEqual([
      { x: 50, y: 50 },
      { x: 50, y: 150 },
    ]);
  });
});
