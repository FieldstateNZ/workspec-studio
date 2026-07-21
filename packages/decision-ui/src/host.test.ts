import { describe, expect, it } from 'vitest';
import type { Decision, LinkType } from '@workspec/decision-schema';
import { createInertLinkResolver, decisionSlug, repositoryId, resolveCatalogRef } from './host.js';
import { createMemoryRepository } from '@workspec/decision-schema';

function decisionWithCatalog(catalog: string): Decision {
  return {
    apiVersion: 'workspec.io/v1alpha1',
    kind: 'Decision',
    metadata: {},
    spec: {
      title: 'd',
      status: 'exploring',
      context: 'c',
      catalog,
      currency: 'USD',
      environments: ['prod'],
      criteria: [],
      options: [{ id: 'o', name: 'o', environments: ['prod'], lines: [], scores: {} }],
    },
  } as Decision;
}

describe('resolveCatalogRef', () => {
  it('resolves the catalog slug to `.workspec/catalogs/<slug>.yaml`', () => {
    const decision = decisionWithCatalog('platform');
    expect(resolveCatalogRef('.workspec/decisions/hosting-platform.yaml', decision)).toBe(
      '.workspec/catalogs/platform.yaml',
    );
  });

  it('ignores the decision ref — the catalog ref never depends on where the decision lives', () => {
    const decision = decisionWithCatalog('shared-prices');
    expect(resolveCatalogRef('some/nested/dir/x.yaml', decision)).toBe(
      '.workspec/catalogs/shared-prices.yaml',
    );
    expect(resolveCatalogRef('anything-at-all', decision)).toBe(
      '.workspec/catalogs/shared-prices.yaml',
    );
  });
});

describe('decisionSlug', () => {
  it('prefers an authored metadata.slug over the ref', () => {
    const decision = decisionWithCatalog('platform');
    decision.metadata.slug = 'authored-slug';
    expect(decisionSlug(decision, '.workspec/decisions/hosting-platform.yaml')).toBe(
      'authored-slug',
    );
  });

  it('falls back to the filename stem of the ref when metadata.slug is absent', () => {
    const decision = decisionWithCatalog('platform');
    expect(decisionSlug(decision, '.workspec/decisions/hosting-platform.yaml')).toBe(
      'hosting-platform',
    );
  });

  it('falls back to the raw ref when it is not `.yaml`-shaped', () => {
    const decision = decisionWithCatalog('platform');
    expect(decisionSlug(decision, 'opaque-memory-ref')).toBe('opaque-memory-ref');
  });
});

describe('createInertLinkResolver', () => {
  it('resolves nothing — every link stays a label', () => {
    const resolve = createInertLinkResolver();
    const link: LinkType = { kind: 'deployment', label: 'deploy/x' };
    expect(resolve(link)).toEqual({ resolved: false });
  });
});

describe('repositoryId', () => {
  it('is stable per instance and distinct across instances', () => {
    const a = createMemoryRepository();
    const b = createMemoryRepository();
    expect(repositoryId(a)).toBe(repositoryId(a));
    expect(repositoryId(a)).not.toBe(repositoryId(b));
  });
});
