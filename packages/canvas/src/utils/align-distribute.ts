import type { Shape, ShapeId } from '../types.js';

// Column-aware "tidy up": cluster the selected shapes into columns by their
// horizontal centre, then within each column left-align and apply a uniform
// vertical gap, and across columns apply a uniform horizontal gap with a shared
// top edge. Generalises to a single column (vertical distribute) and to a row
// of singletons (horizontal distribute). Connectors are excluded — they follow
// their endpoints.

const MIN_V_GAP = 16;
const MIN_H_GAP = 40;
const DEFAULT_V_GAP = 24;
const DEFAULT_H_GAP = 64;

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  const atMid = s[mid] ?? 0;
  const belowMid = s[mid - 1] ?? 0;
  return s.length % 2 ? atMid : (belowMid + atMid) / 2;
}

interface Column {
  members: Shape[];
  centerSum: number;
}

/**
 * Compute the tidy-up target positions for a selection. Pure — the store's
 * `alignDistribute` action turns the returned map into one undoable
 * command. Returns an empty map when fewer than two box shapes are given.
 */
export function computeAlignDistribute(shapes: Shape[]): Map<ShapeId, { x: number; y: number }> {
  const result = new Map<ShapeId, { x: number; y: number }>();
  const boxes = shapes.filter((s) => s.type !== 'connector');
  if (boxes.length < 2) return result;

  const medW = median(boxes.map((b) => b.width)) ?? 100;
  // Two shapes share a column when their centres are within ~0.6 of a typical
  // card width — wide enough to absorb drift, narrow enough to split adjacent
  // columns that have a real gap between them.
  const colThreshold = medW * 0.6;

  // ── Cluster into left-to-right columns by centre-x ──────────────────────
  const byCenter = [...boxes].sort((a, b) => a.x + a.width / 2 - (b.x + b.width / 2));
  const columns: Column[] = [];
  for (const s of byCenter) {
    const center = s.x + s.width / 2;
    const last = columns[columns.length - 1];
    const lastCenter = last ? last.centerSum / last.members.length : null;
    if (last && lastCenter !== null && center - lastCenter < colThreshold) {
      last.members.push(s);
      last.centerSum += center;
    } else {
      columns.push({ members: [s], centerSum: center });
    }
  }

  // ── Uniform gaps derived from the current layout (median, clamped) ──────
  const vGaps: number[] = [];
  for (const col of columns) {
    const ys = [...col.members].sort((a, b) => a.y - b.y);
    for (let i = 0; i < ys.length - 1; i++) {
      const above = ys[i];
      const below = ys[i + 1];
      if (above && below) vGaps.push(below.y - (above.y + above.height));
    }
  }
  const vGap = Math.max(MIN_V_GAP, median(vGaps) ?? DEFAULT_V_GAP);

  const colExtents = columns.map((col) => ({
    left: Math.min(...col.members.map((m) => m.x)),
    right: Math.max(...col.members.map((m) => m.x + m.width)),
  }));
  const hGaps: number[] = [];
  for (let i = 0; i < colExtents.length - 1; i++) {
    const current = colExtents[i];
    const next = colExtents[i + 1];
    if (current && next) hGaps.push(next.left - current.right);
  }
  const hGap = Math.max(MIN_H_GAP, median(hGaps) ?? DEFAULT_H_GAP);

  // ── Lay out: columns share a top edge; members left-aligned + even gaps ──
  const globalTop = Math.min(...boxes.map((b) => b.y));
  const globalLeft = Math.min(...boxes.map((b) => b.x));

  let curX = globalLeft;
  for (const col of columns) {
    const colWidth = Math.max(...col.members.map((m) => m.width));
    let curY = globalTop;
    const ordered = [...col.members].sort((a, b) => a.y - b.y);
    for (const m of ordered) {
      result.set(m.id, { x: curX, y: curY });
      curY += m.height + vGap;
    }
    curX += colWidth + hGap;
  }

  return result;
}
