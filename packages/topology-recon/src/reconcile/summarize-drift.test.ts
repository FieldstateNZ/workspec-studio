import { describe, expect, it } from 'vitest';
import type { Drift } from '../model/drift.types.js';
import { summarizeDrift } from './summarize-drift.js';

describe('summarizeDrift', () => {
  it('reports every class at 0 and hasDrift: false for an empty result', () => {
    expect(summarizeDrift([])).toEqual({
      countsByClass: { phantom: 0, orphan: 0, divergent: 0, miswired: 0 },
      total: 0,
      hasDrift: false,
    });
  });

  it('counts each drift by class and sets hasDrift: true', () => {
    const drifts: readonly Drift[] = [
      { class: 'phantom', slug: 'search', message: '' },
      { class: 'phantom', slug: 'sql-pe', message: '' },
      { class: 'orphan', slug: 'diag-storage', message: '' },
    ];

    expect(summarizeDrift(drifts)).toEqual({
      countsByClass: { phantom: 2, orphan: 1, divergent: 0, miswired: 0 },
      total: 3,
      hasDrift: true,
    });
  });
});
