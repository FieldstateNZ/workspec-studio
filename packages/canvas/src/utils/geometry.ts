import type { Vec2, Box } from '../types.js';

/** Clockwise rotation in screen coordinates (Y-axis points down). */
export function rotatePoint(x: number, y: number, cx: number, cy: number, angleDeg: number): Vec2 {
  const theta = (angleDeg * Math.PI) / 180;
  const dx = x - cx;
  const dy = y - cy;
  return {
    x: cx + dx * Math.cos(theta) - dy * Math.sin(theta),
    y: cy + dx * Math.sin(theta) + dy * Math.cos(theta),
  };
}

/** True when `p` lies inside (or on the edge of) `rect`. */
export function hitTestPointInRect(p: Vec2, rect: Box): boolean {
  return (
    p.x >= rect.x && p.x <= rect.x + rect.width && p.y >= rect.y && p.y <= rect.y + rect.height
  );
}

/** Shortest distance from `p` to the segment `a`→`b` (degenerate segments collapse to a point). */
export function distanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    return Math.hypot(p.x - a.x, p.y - a.y);
  }
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  return Math.hypot(p.x - projX, p.y - projY);
}

/** True when `p` is within `tolerance` of any segment of the polyline. */
export function hitTestPointToPolyline(p: Vec2, points: Vec2[], tolerance: number): boolean {
  if (points.length < 2) return false;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (a && b && distanceToSegment(p, a, b) <= tolerance) {
      return true;
    }
  }
  return false;
}

/** True when the two boxes overlap (strict — touching edges do not count). */
export function rectsIntersect(a: Box, b: Box): boolean {
  return (
    a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
  );
}
