import { describe, expect, it } from 'vitest';
import { DIAGNOSTIC_CODES } from '../../src/model/diagnostic-codes.js';
import { loadC4Model } from '../../src/load-c4-model.js';
import { createMemorySource } from '../../src/sources/memory-source.js';

describe('dangling-link', () => {
  it('flags a ~/ link that does not resolve to a file in the tree', async () => {
    const model = await loadC4Model(
      createMemorySource({
        '.workspec/actors/architect.yaml':
          'title: Architect\ndescription: Designs things.\nlinks:\n  - adr: "~/docs/missing.md"\n',
      }),
    );

    expect(model.diagnostics).toMatchObject([
      { severity: 'warning', code: DIAGNOSTIC_CODES.danglingLink, file: '.workspec/actors/architect.yaml', slug: 'architect' },
    ]);
  });

  it('never diagnoses an @workspace/ link (external, not resolvable standalone)', async () => {
    const model = await loadC4Model(
      createMemorySource({
        '.workspec/actors/architect.yaml':
          'title: Architect\ndescription: Designs things.\nlinks:\n  - adr: "@workspace/some-package/README.md"\n',
      }),
    );

    expect(model.diagnostics).toEqual([]);
  });

  it('does not flag a ~/ link that resolves to a real file', async () => {
    const model = await loadC4Model(
      createMemorySource({
        'docs/README.md': '# hello',
        '.workspec/actors/architect.yaml':
          'title: Architect\ndescription: Designs things.\nlinks:\n  - adr: "~/docs/README.md"\n',
      }),
    );

    expect(model.diagnostics).toEqual([]);
  });
});

describe('link-cycle', () => {
  it('detects a two-element cycle among ~/ links', async () => {
    const model = await loadC4Model(
      createMemorySource({
        '.workspec/domains/billing.yaml':
          'title: Billing\ndescription: Billing domain.\nlinks:\n  - related: "~/.workspec/domains/invoicing.yaml"\n',
        '.workspec/domains/invoicing.yaml':
          'title: Invoicing\ndescription: Invoicing domain.\nlinks:\n  - related: "~/.workspec/domains/billing.yaml"\n',
      }),
    );

    const cycles = model.diagnostics.filter((d) => d.code === DIAGNOSTIC_CODES.linkCycle);
    expect(cycles).toHaveLength(1);
    expect(cycles[0]?.severity).toBe('warning');
    expect(cycles[0]?.message).toContain('billing');
    expect(cycles[0]?.message).toContain('invoicing');
  });

  it('does not flag a plain chain with no cycle', async () => {
    const model = await loadC4Model(
      createMemorySource({
        '.workspec/domains/billing.yaml':
          'title: Billing\ndescription: Billing domain.\nlinks:\n  - related: "~/.workspec/domains/invoicing.yaml"\n',
        '.workspec/domains/invoicing.yaml': 'title: Invoicing\ndescription: Invoicing domain.\n',
      }),
    );

    expect(model.diagnostics.filter((d) => d.code === DIAGNOSTIC_CODES.linkCycle)).toEqual([]);
  });
});
