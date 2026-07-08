import { describe, expect, it } from 'vitest';
import { DIAGNOSTIC_CODES } from '../../src/model/diagnostic-codes.js';
import { loadC4Model } from '../../src/load-c4-model.js';
import { createMemorySource } from '../../src/sources/memory-source.js';

const domainBilling = 'title: Billing\ndescription: Domain view of billing.\n';
const containerBilling = 'type: container\ntitle: Billing Service\ndescription: Container view of billing.\n';
const featureBilling = 'title: Billing\ndescription: Feature view of billing.\n';

describe('duplicate-slug: bare ref ambiguous across kinds', () => {
  it('c4-component diagram picks feature (preferred) over domain, and warns once', async () => {
    const model = await loadC4Model(
      createMemorySource({
        '.workspec/domains/billing.yaml': domainBilling,
        '.workspec/features/billing.yaml': featureBilling,
        '.workspec/diagrams/comp.yaml':
          'title: Component\ntype: c4-component\nnodes:\n  - slug: billing\nedges: []\n',
      }),
    );

    const warnings = model.diagnostics.filter((d) => d.code === DIAGNOSTIC_CODES.duplicateSlug);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({
      severity: 'warning',
      file: '.workspec/diagrams/comp.yaml',
      slug: 'comp',
      refSlug: 'billing',
      // `- slug: billing` is line 4 of the diagram YAML.
      line: 4,
    });

    const diagram = model.diagrams[0];
    expect(diagram?.view?.nodes[0]).toMatchObject({ slug: 'billing', kind: 'feature', title: 'Billing' });
  });
});

describe('c4-container lens partitioning', () => {
  it('resolves the same ambiguous bare slug to domain under logical and container under deployment', async () => {
    const model = await loadC4Model(
      createMemorySource({
        '.workspec/domains/billing.yaml': domainBilling,
        '.workspec/containers/billing.yaml': containerBilling,
        '.workspec/diagrams/system.yaml':
          'title: Container\ntype: c4-container\nnodes:\n  - slug: billing\nedges: []\n',
      }),
    );

    const diagram = model.diagrams[0];
    expect(diagram?.lensViews?.logical.nodes[0]).toMatchObject({ slug: 'billing', kind: 'domain' });
    expect(diagram?.lensViews?.deployment.nodes[0]).toMatchObject({ slug: 'billing', kind: 'container' });

    // The ambiguity is real regardless of lens, but it's the same diagram+slug — deduped to one diagnostic.
    const warnings = model.diagnostics.filter((d) => d.code === DIAGNOSTIC_CODES.duplicateSlug);
    expect(warnings).toHaveLength(1);
  });
});
