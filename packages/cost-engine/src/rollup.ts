// Rollups, cross-tabs and coverage: all three share the same "distribute a
// resource's spend across its dimension assignment" primitive — a literal
// assignment contributes its full spend to one key; a split contributes
// ratio-weighted amounts to each part's key; an unresolved dimension
// contributes to the `'unattributed'` bucket.

import type { Coverage, CrossTab, CrossTabCell, ResourceResolution, Rollup, RollupBucket } from './types.js';

/**
 * The reserved sentinel bucket/cell key rollups and cross-tabs use for a
 * resource unresolved on a dimension. Exported so `resolve.ts` can detect
 * when a *resolved* dimension value collides with it and emit the
 * `reserved-dimension-value` diagnostic (see the README's "reserved value"
 * note and diagnostics catalog).
 */
export const UNATTRIBUTED = 'unattributed';

interface KeyedShare {
  key: string;
  ratio: number;
}

/** The (key, ratio) shares a resource's spend distributes into for one dimension. */
function sharesFor(resolution: ResourceResolution, dimensionId: string): KeyedShare[] {
  const assignment = resolution.assignments[dimensionId];
  if (assignment === undefined) return [{ key: UNATTRIBUTED, ratio: 1 }];
  if (assignment.kind === 'value') return [{ key: assignment.value, ratio: 1 }];
  return assignment.parts.map((part) => ({ key: part.value, ratio: part.ratio }));
}

/**
 * Roll up spend by one dimension: splits distributed by ratio, plus an
 * `'unattributed'` bucket for resources unresolved on this dimension.
 */
export function rollupBy(
  resolutions: readonly ResourceResolution[],
  resourceSpend: Readonly<Record<string, number>>,
  dimensionId: string,
): Rollup {
  const buckets = new Map<string, number>();
  for (const resolution of resolutions) {
    const spend = resourceSpend[resolution.resourceId] ?? 0;
    for (const share of sharesFor(resolution, dimensionId)) {
      buckets.set(share.key, (buckets.get(share.key) ?? 0) + spend * share.ratio);
    }
  }
  const out: RollupBucket[] = [...buckets.entries()].map(([key, amount]) => ({ key, amount }));
  return { dimensionId, buckets: out };
}

/**
 * Cross-tab spend by two dimensions: splits distributed by ratio on BOTH
 * axes (a resource split 60/40 on the row dimension and resolved on the
 * column dimension contributes 60%/40% shares, each landing in its own cell).
 *
 * Cells are keyed STRUCTURALLY (a nested `Map<rowKey, Map<colKey, amount>>`),
 * never by joining `rowKey`/`colKey` into a single string: `fromTag`-derived
 * dimension values are unrestricted `resourceTagValue`s and may themselves
 * contain any separator character (including spaces), so any join/split
 * round-trip risks silently truncating a value or merging two distinct
 * values into the same cell.
 */
export function crossTab(
  resolutions: readonly ResourceResolution[],
  resourceSpend: Readonly<Record<string, number>>,
  rowDimensionId: string,
  colDimensionId: string,
): CrossTab {
  const cells = new Map<string, Map<string, number>>();
  for (const resolution of resolutions) {
    const spend = resourceSpend[resolution.resourceId] ?? 0;
    const rowShares = sharesFor(resolution, rowDimensionId);
    const colShares = sharesFor(resolution, colDimensionId);
    for (const row of rowShares) {
      let rowCells = cells.get(row.key);
      if (rowCells === undefined) {
        rowCells = new Map<string, number>();
        cells.set(row.key, rowCells);
      }
      for (const col of colShares) {
        rowCells.set(col.key, (rowCells.get(col.key) ?? 0) + spend * row.ratio * col.ratio);
      }
    }
  }
  const out: CrossTabCell[] = [];
  for (const [rowKey, rowCells] of cells) {
    for (const [colKey, amount] of rowCells) {
      out.push({ rowKey, colKey, amount });
    }
  }
  return { rowDimensionId, colDimensionId, cells: out };
}

/**
 * Coverage for one dimension: a resource is attributed on `dimensionId` iff
 * it resolved there (a split counts as attributed). `ratio` is
 * `attributedSpend / totalSpend` (`1` when `totalSpend` is `0`).
 */
export function computeCoverage(
  resolutions: readonly ResourceResolution[],
  resourceSpend: Readonly<Record<string, number>>,
  dimensionId: string,
  isPrimary: boolean,
): Coverage {
  let attributedSpend = 0;
  let unattributedSpend = 0;
  let unattributedCount = 0;
  let totalSpend = 0;

  for (const resolution of resolutions) {
    const spend = resourceSpend[resolution.resourceId] ?? 0;
    totalSpend += spend;
    if (resolution.assignments[dimensionId] !== undefined) {
      attributedSpend += spend;
    } else {
      unattributedSpend += spend;
      unattributedCount++;
    }
  }

  return {
    dimensionId,
    isPrimary,
    attributedSpend,
    unattributedSpend,
    ratio: totalSpend > 0 ? attributedSpend / totalSpend : 1,
    unattributedCount,
    totalSpend,
  };
}
