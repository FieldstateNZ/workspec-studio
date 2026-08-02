import type { Vec2 } from '../../types.js';

/** Freehand points → SVG path: quadratic bezier through midpoints (Chaikin-style). */
export function pointsToSvgPath(points: Vec2[]): string {
  const first = points[0];
  if (points.length < 2 || first === undefined) return '';
  if (points.length === 2) {
    const second = points[1];
    if (second === undefined) return '';
    return `M ${String(first.x)} ${String(first.y)} L ${String(second.x)} ${String(second.y)}`;
  }

  const parts: string[] = [`M ${String(first.x)} ${String(first.y)}`];
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i + 1];
    if (p1 === undefined) continue;
    if (i === points.length - 2) {
      parts.push(`L ${String(p1.x)} ${String(p1.y)}`);
    } else {
      const p2 = points[i + 2];
      if (p2 === undefined) continue;
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      parts.push(`Q ${String(p1.x)} ${String(p1.y)} ${String(midX)} ${String(midY)}`);
    }
  }
  return parts.join(' ');
}
