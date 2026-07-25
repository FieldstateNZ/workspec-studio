import { describe, expect, it } from 'vitest';
import { fanEdges } from './fan-edges.js';

describe('fanEdges', () => {
  it('assigns a single edge zero offset in both directions', () => {
    const offsets = fanEdges([{ from: 'a', to: 'b' }]);
    expect(offsets).toEqual([{ sOff: 0, tOff: 0 }]);
  });

  it('fans multiple edges sharing the same source apart, symmetrically around zero', () => {
    const offsets = fanEdges([
      { from: 'a', to: 'b' },
      { from: 'a', to: 'c' },
      { from: 'a', to: 'd' },
    ]);
    expect(offsets.map((o) => o.sOff)).toEqual([-9, 0, 9]);
  });

  it('fans multiple edges sharing the same target apart independently of source fan-out', () => {
    const offsets = fanEdges([
      { from: 'a', to: 'z' },
      { from: 'b', to: 'z' },
    ]);
    expect(offsets.map((o) => o.tOff)).toEqual([-4.5, 4.5]);
  });

  it('is deterministic for the same input order', () => {
    const edges = [
      { from: 'a', to: 'b' },
      { from: 'a', to: 'c' },
    ];
    expect(fanEdges(edges)).toEqual(fanEdges(edges));
  });
});
