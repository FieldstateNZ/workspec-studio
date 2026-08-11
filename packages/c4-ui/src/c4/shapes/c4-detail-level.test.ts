import { describe, expect, test } from 'vitest';
import {
  C4_LOD_FLAT_ZOOM,
  C4_LOD_TITLE_ZOOM,
  detailLevelForZoom,
} from './c4-detail-level.js';

// The zoom ladder itself (#134). Kept as a pure-function suite so the
// thresholds are pinned independently of any React rendering — the card
// test asserts the ladder is actually WIRED, this one asserts it is right.

describe('detailLevelForZoom', () => {
  test('matches the enterprise thresholds exactly', () => {
    // Mutation guard: nudging either constant moves one of these boundaries.
    expect(C4_LOD_FLAT_ZOOM).toBe(0.35);
    expect(C4_LOD_TITLE_ZOOM).toBe(0.6);
  });

  test('is a monotonic ladder with half-open bands', () => {
    expect(detailLevelForZoom(0)).toBe('flat');
    expect(detailLevelForZoom(0.34999)).toBe('flat');
    // Boundaries belong to the HIGHER-detail band (`<`, never `<=`), so a
    // camera resting exactly on a threshold never flickers between tiers.
    expect(detailLevelForZoom(C4_LOD_FLAT_ZOOM)).toBe('title');
    expect(detailLevelForZoom(0.59999)).toBe('title');
    expect(detailLevelForZoom(C4_LOD_TITLE_ZOOM)).toBe('full');
    expect(detailLevelForZoom(1)).toBe('full');
    expect(detailLevelForZoom(4)).toBe('full');
  });

  test('quantises — every zoom in a band returns the SAME reference', () => {
    // This is what makes the store subscription cheap: zustand compares
    // selector results with Object.is, so a whole band of zooms must
    // collapse to one identical value or every card re-renders per tick.
    const band = [0.6, 0.75, 0.9, 1, 1.5, 3].map(detailLevelForZoom);
    expect(new Set(band).size).toBe(1);
  });
});
