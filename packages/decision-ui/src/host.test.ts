import { describe, expect, it } from 'vitest';
import type { Decision, LinkType } from '@workspec/decision-schema';
import { createInertLinkResolver, repositoryId, resolveCatalogRef } from './host.js';
import { createMemoryRepository } from '@workspec/decision-schema';

function decisionWithCatalog(catalog: string): Decision {
  return {
    apiVersion: 'workspec.io/v1alpha1',
    kind: 'Decision',
    metadata: { id: 'd', title: 'd', status: 'exploring' },
    spec: {
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
  it('resolves a sibling catalog relative to a bare decision ref', () => {
    const decision = decisionWithCatalog('./platform.catalog.yaml');
    expect(resolveCatalogRef('hosting-platform.decision.yaml', decision)).toBe(
      'platform.catalog.yaml',
    );
  });

  it('resolves relative to a nested decision ref (matches FsRepository)', () => {
    const decision = decisionWithCatalog('./platform.catalog.yaml');
    expect(resolveCatalogRef('examples/hosting-platform/x.decision.yaml', decision)).toBe(
      'examples/hosting-platform/platform.catalog.yaml',
    );
  });

  it('resolves parent-relative catalog paths', () => {
    const decision = decisionWithCatalog('../shared/prices.catalog.yaml');
    expect(resolveCatalogRef('team/x.decision.yaml', decision)).toBe('shared/prices.catalog.yaml');
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
