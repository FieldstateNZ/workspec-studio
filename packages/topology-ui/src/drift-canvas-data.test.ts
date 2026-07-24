import { describe, expect, it } from 'vitest';
import type { DerivedTopology, Drift } from '@workspec/topology-recon';
import { buildDriftBySlug, buildGhostEdges, buildOrphanNodes } from './drift-canvas-data.js';

const DRIFTS: readonly Drift[] = [
  { class: 'phantom', slug: 'search', message: 'phantom' },
  { class: 'orphan', slug: 'diag-storage', message: 'orphan' },
  {
    class: 'divergent',
    authoredSlug: 'app-service',
    actualSlug: 'app-service-01',
    message: 'divergent',
    configDiff: [],
    costDiff: [],
  },
  {
    class: 'miswired',
    slugs: ['app-service', 'sql', 'sql-pe'],
    message: 'miswired',
    edges: [
      { from: 'app-service', to: 'sql-pe', class: 'primary', side: 'authored-only' },
      { from: 'sql-pe', to: 'sql', class: 'primary', side: 'authored-only' },
      { from: 'app-service', to: 'sql', class: 'primary', side: 'actual-only' },
    ],
  },
];

const DERIVED: DerivedTopology = {
  envSlug: 'prod',
  resources: [
    {
      slug: 'diag-storage',
      name: 'Diagnostics storage',
      kind: 'storage',
      type: 'Azure Storage Account',
      provider: 'azure',
      resourceGroup: null,
      config: null,
      cost: null,
      source: null,
    },
    {
      slug: 'app-service-01',
      name: 'App Service',
      kind: 'compute',
      type: 'Azure App Service',
      provider: 'azure',
      resourceGroup: null,
      config: null,
      cost: null,
      source: null,
    },
  ],
  connections: [],
};

describe('buildDriftBySlug', () => {
  it('maps phantom to its own slug and divergent to its authoredSlug', () => {
    expect(buildDriftBySlug(DRIFTS)).toEqual({
      search: 'phantom',
      'app-service': 'divergent',
    });
  });

  it('never badges any of a miswired cluster\'s node slugs — the ghost edge is that class\'s own signal', () => {
    const bySlug = buildDriftBySlug(DRIFTS);
    expect(bySlug.sql).toBeUndefined();
    expect(bySlug['sql-pe']).toBeUndefined();
  });

  it('never includes an orphan slug — orphans render via orphanNodes, not driftBySlug', () => {
    expect(buildDriftBySlug(DRIFTS)['diag-storage']).toBeUndefined();
  });
});

describe('buildOrphanNodes', () => {
  it('returns only the derived resources matching an orphan-class drift', () => {
    const orphans = buildOrphanNodes(DERIVED, DRIFTS);
    expect(orphans).toEqual([
      { slug: 'diag-storage', kind: 'storage', name: 'Diagnostics storage', type: 'Azure Storage Account' },
    ]);
  });
});

describe('buildGhostEdges', () => {
  it('extracts only the actual-only edge from a miswired cluster (the bypass line)', () => {
    expect(buildGhostEdges(DRIFTS)).toEqual([{ from: 'app-service', to: 'sql' }]);
  });

  it('returns an empty array when there is no miswired drift', () => {
    expect(buildGhostEdges(DRIFTS.filter((d) => d.class !== 'miswired'))).toEqual([]);
  });
});
