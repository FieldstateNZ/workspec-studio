import { describe, expect, it } from 'vitest';
import { orthogonalEdgePath, routeMidpoint } from './edge-path.js';

describe('orthogonalEdgePath', () => {
  it('renders an empty route as an empty path', () => {
    expect(orthogonalEdgePath([])).toBe('');
  });

  it('renders a two-point route as a straight line', () => {
    expect(
      orthogonalEdgePath([
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ]),
    ).toBe('M 0 0 L 100 0');
  });

  it('rounds each interior bend of a multi-point route with a quadratic curve', () => {
    const d = orthogonalEdgePath(
      [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 50, y: 50 },
      ],
      12,
    );
    expect(d).toBe('M 0 0 L 38 0 Q 50 0 50 12 L 50 50');
  });

  it('clamps the corner radius so it never overshoots a short segment', () => {
    const d = orthogonalEdgePath(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ],
      12,
    );
    // Segments are 10 long each; radius clamps to 5 (half), not 12.
    expect(d).toBe('M 0 0 L 5 0 Q 10 0 10 5 L 10 10');
  });

  it('is deterministic — identical input produces identical output', () => {
    const route = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 40 },
      { x: 80, y: 40 },
    ];
    expect(orthogonalEdgePath(route)).toBe(orthogonalEdgePath(route));
  });
});

describe('routeMidpoint', () => {
  it('is the exact centre of a straight two-point route', () => {
    expect(
      routeMidpoint([
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ]),
    ).toEqual({ x: 50, y: 0 });
  });

  it('walks cumulative length across a multi-segment route to find the 50% point', () => {
    // Total length 150 (100 + 50); midpoint at 75 lands 75 into the first segment.
    const mid = routeMidpoint([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
    ]);
    expect(mid).toEqual({ x: 75, y: 0 });
  });

  it('returns the single point for a degenerate one-point route', () => {
    expect(routeMidpoint([{ x: 5, y: 5 }])).toEqual({ x: 5, y: 5 });
  });
});
