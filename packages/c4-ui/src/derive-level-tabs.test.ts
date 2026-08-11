import { describe, expect, it } from 'vitest';
import { deriveLevelTabs } from './derive-level-tabs.js';
import { loadAmbiguousLevelModel, loadSyntheticModel } from './test-helpers/synthetic-model.js';

// The derivation is ALSO consumed outside the explorer since A1 (#131):
// c4-studio's sidebar diagrams list orders itself with it and opens on its
// first entry. These tests pin the contract directly (the explorer's own
// suite exercises it through the rendered tabs).

describe('deriveLevelTabs', () => {
  it('numbers each canonical level exactly once, ordered context → container → component, ahead of discovery order', async () => {
    const model = await loadSyntheticModel();

    const tabs = deriveLevelTabs(model.diagrams);

    // Discovery (file) order is lexicographic — "billing" first. The tab
    // derivation must NOT follow it: canonical levels lead, in level order.
    expect(model.diagrams[0]?.slug).toBe('billing');
    expect(tabs.map((t) => t.label)).toEqual(['1 · Context', '2 · Container', '3 · Component']);
    expect(tabs.map((t) => t.slug)).toEqual(['context', 'ledger', 'billing']);
  });

  it('the first entry is the explorer default — the lowest-numbered canonical level present', async () => {
    const model = await loadSyntheticModel();
    expect(deriveLevelTabs(model.diagrams)[0]?.slug).toBe('context');
  });

  it('an ambiguous canonical type (two c4-container diagrams) falls back to per-diagram titles, appended after the numbered tabs', async () => {
    const model = await loadAmbiguousLevelModel();

    const tabs = deriveLevelTabs(model.diagrams);

    expect(tabs.map((t) => t.label)).toEqual([
      '1 · Context',
      'Container View A',
      'Container View B',
    ]);
    // Neither ambiguous diagram is ever numbered.
    expect(tabs.some((t) => t.label.includes('2 · Container'))).toBe(false);
  });

  it('returns an empty list for an empty model', () => {
    expect(deriveLevelTabs([])).toEqual([]);
  });
});
