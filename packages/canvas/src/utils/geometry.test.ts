import { describe, expect, test } from 'vitest';
import {
  distanceToSegment,
  hitTestPointInRect,
  hitTestPointToPolyline,
  rectsIntersect,
  rotatePoint,
} from './geometry.js';

describe('rotatePoint', () => {
  test('rotates clockwise in screen coordinates (Y down)', () => {
    // 90° clockwise about the origin sends (1, 0) to (0, 1) when Y points down.
    const p = rotatePoint(1, 0, 0, 0, 90);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(1);
  });

  test('rotation about a non-origin centre; -angle inverts', () => {
    const rotated = rotatePoint(10, 20, 4, 6, 37);
    const back = rotatePoint(rotated.x, rotated.y, 4, 6, -37);
    expect(back.x).toBeCloseTo(10);
    expect(back.y).toBeCloseTo(20);
  });
});

describe('distanceToSegment', () => {
  test('perpendicular distance inside the segment span', () => {
    expect(distanceToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(3);
  });

  test('clamps to the nearest endpoint beyond the span', () => {
    expect(distanceToSegment({ x: -4, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(5);
  });

  test('degenerate segment collapses to point distance', () => {
    expect(distanceToSegment({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBeCloseTo(5);
  });
});

describe('hitTestPointToPolyline', () => {
  const polyline = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
  ];

  test('hits within tolerance of any segment', () => {
    expect(hitTestPointToPolyline({ x: 11.5, y: 5 }, polyline, 2)).toBe(true);
  });

  test('misses beyond tolerance and on degenerate polylines', () => {
    expect(hitTestPointToPolyline({ x: 15, y: 5 }, polyline, 2)).toBe(false);
    expect(hitTestPointToPolyline({ x: 0, y: 0 }, [{ x: 0, y: 0 }], 2)).toBe(false);
  });
});

describe('rect predicates', () => {
  test('hitTestPointInRect includes edges', () => {
    const rect = { x: 0, y: 0, width: 10, height: 10 };
    expect(hitTestPointInRect({ x: 0, y: 10 }, rect)).toBe(true);
    expect(hitTestPointInRect({ x: 10.01, y: 5 }, rect)).toBe(false);
  });

  test('rectsIntersect is strict: touching edges do not intersect', () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    expect(rectsIntersect(a, { x: 10, y: 0, width: 5, height: 5 })).toBe(false);
    expect(rectsIntersect(a, { x: 9.99, y: 0, width: 5, height: 5 })).toBe(true);
    expect(rectsIntersect(a, { x: -20, y: -20, width: 100, height: 100 })).toBe(true);
  });
});
