import { describe, expect, it } from 'vitest';
import { loadSyntheticModel } from './synthetic-model.js';

describe('loadSyntheticModel', () => {
  it('loads with no diagnostics', async () => {
    const model = await loadSyntheticModel();
    expect(model.diagnostics).toEqual([]);
  });

  it('has the three drill-down levels, each addressable by the slug the next level down shares', async () => {
    const model = await loadSyntheticModel();
    const slugs = model.diagrams.map((d) => d.slug).sort();
    expect(slugs).toEqual(['billing', 'context', 'ledger']);
  });

  it('the context diagram\'s injected system node resolves to the system\'s own slug ("ledger")', async () => {
    const model = await loadSyntheticModel();
    const context = model.diagrams.find((d) => d.slug === 'context');
    const systemNode = context?.view?.nodes.find((n) => n.kind === 'system');
    expect(systemNode?.slug).toBe('ledger');
    // Materialized by c4-model's system-injection safety net (only edges
    // reference `__system__` — no `slug: ledger`/`{system: ledger}` node entry).
    expect(systemNode?.injected).toBe(true);
  });

  it('the container diagram\'s billing domain node resolves to slug "billing"', async () => {
    const model = await loadSyntheticModel();
    const container = model.diagrams.find((d) => d.slug === 'ledger');
    const billingNode = container?.lensViews?.logical.nodes.find((n) => n.kind === 'domain');
    expect(billingNode?.slug).toBe('billing');
  });
});
