import type { Vec2 } from '../../types.js';

// Ramer–Douglas–Peucker stroke simplification, ported verbatim from the
// enterprise shapes/draw/simplify.ts.

function perpendicularDistance(point: Vec2, start: Vec2, end: Vec2): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }
  const t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy);
  const tc = Math.max(0, Math.min(1, t));
  return Math.hypot(point.x - (start.x + tc * dx), point.y - (start.y + tc * dy));
}

function douglasPeucker(points: Vec2[], tolerance: number): Vec2[] {
  if (points.length <= 2) return points;
  let maxDist = 0;
  let maxIndex = 0;
  const start = points[0];
  const end = points[points.length - 1];
  if (start === undefined || end === undefined) return points;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    if (p === undefined) continue;
    const d = perpendicularDistance(p, start, end);
    if (d > maxDist) {
      maxDist = d;
      maxIndex = i;
    }
  }
  if (maxDist <= tolerance) {
    return [start, end];
  }
  const left = douglasPeucker(points.slice(0, maxIndex + 1), tolerance);
  const right = douglasPeucker(points.slice(maxIndex), tolerance);
  return [...left.slice(0, -1), ...right];
}

export function simplify(points: Vec2[], tolerance: number): Vec2[] {
  if (points.length <= 2) return points;
  return douglasPeucker(points, tolerance);
}
