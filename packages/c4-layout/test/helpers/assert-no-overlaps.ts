import { expect } from 'vitest';
import { rectsOverlap } from '../../src/index.js';
import type { PositionedNode } from '../../src/index.js';

/**
 * Asserts every pair of nodes in a positioned diagram is collision-free,
 * using the package's own `rectsOverlap` — the same rect-intersection
 * check `resolveNodeRects` uses internally to decide when an auto-placed
 * node must move. Reusing it here (rather than a second hand-rolled
 * overlap check) is what makes this a test of "the nudge pass actually
 * satisfies its own invariant," not just "this looks right by eye."
 */
export function assertNoOverlaps(nodes: readonly PositionedNode[]): void {
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const a = nodes[i];
      const b = nodes[j];
      if (!a || !b) continue;
      expect(rectsOverlap(a, b), `expected "${a.nodeId}" and "${b.nodeId}" not to overlap`).toBe(
        false,
      );
    }
  }
}
