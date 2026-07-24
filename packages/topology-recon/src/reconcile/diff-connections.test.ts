import { describe, expect, it } from 'vitest';
import type { ResolvedConnection } from '@workspec/topology-model';
import type { DerivedConnection } from '../model/derived-topology.types.js';
import type { ResourceMatch } from '../match/match-resources.types.js';
import { diffConnections } from './diff-connections.js';

const IDENTITY_MATCHES: readonly ResourceMatch[] = [
  { authoredSlug: 'app-service', actualSlug: 'app-service', rung: 'tuple' },
  { authoredSlug: 'sql-pe', actualSlug: 'sql-pe', rung: 'tuple' },
  { authoredSlug: 'sql', actualSlug: 'sql', rung: 'tuple' },
];

describe('diffConnections', () => {
  it('returns nothing when authored and actual edges are identical', () => {
    const edges: readonly ResolvedConnection[] = [
      { from: 'app-service', to: 'sql', class: 'primary' },
    ];
    expect(diffConnections(edges, edges, IDENTITY_MATCHES)).toEqual([]);
  });

  it('ignores an edge touching an unmatched resource entirely (that resource already reports as phantom/orphan)', () => {
    const authored: readonly ResolvedConnection[] = [
      { from: 'app-service', to: 'search', class: 'primary' },
    ];
    const actual: readonly DerivedConnection[] = [];
    const matches: readonly ResourceMatch[] = [
      { authoredSlug: 'app-service', actualSlug: 'app-service', rung: 'tuple' },
    ];

    expect(diffConnections(authored, actual, matches)).toEqual([]);
  });

  it('groups a rerouted path into one miswired drift touching every affected node, not one row per edge', () => {
    // Authored: app-service -> sql-pe -> sql. Actual: app-service -> sql directly.
    const authored: readonly ResolvedConnection[] = [
      { from: 'app-service', to: 'sql-pe', class: 'primary' },
      { from: 'sql-pe', to: 'sql', class: 'primary' },
    ];
    const actual: readonly DerivedConnection[] = [
      { from: 'app-service', to: 'sql', class: 'primary' },
    ];

    const result = diffConnections(authored, actual, IDENTITY_MATCHES);

    expect(result).toHaveLength(1);
    expect(result[0]?.slugs).toEqual(['app-service', 'sql', 'sql-pe']);
    expect(result[0]?.edges).toEqual([
      { from: 'app-service', to: 'sql-pe', class: 'primary', side: 'authored-only' },
      { from: 'sql-pe', to: 'sql', class: 'primary', side: 'authored-only' },
      { from: 'app-service', to: 'sql', class: 'primary', side: 'actual-only' },
    ]);
  });

  it('maps actual edges through the matcher, so a renamed actual slug never produces a false miswire', () => {
    const authored: readonly ResolvedConnection[] = [
      { from: 'app-service', to: 'sql', class: 'primary' },
    ];
    const actual: readonly DerivedConnection[] = [
      { from: 'app-service-1', to: 'sql-1', class: 'primary' },
    ];
    const matches: readonly ResourceMatch[] = [
      { authoredSlug: 'app-service', actualSlug: 'app-service-1', rung: 'tuple' },
      { authoredSlug: 'sql', actualSlug: 'sql-1', rung: 'tuple' },
    ];

    expect(diffConnections(authored, actual, matches)).toEqual([]);
  });

  it('skips miswired detection entirely when actual connectivity was never observed (actualConnections undefined), even though authored declares edges', () => {
    const authored: readonly ResolvedConnection[] = [
      { from: 'app-service', to: 'sql-pe', class: 'primary' },
      { from: 'sql-pe', to: 'sql', class: 'primary' },
    ];

    expect(diffConnections(authored, undefined, IDENTITY_MATCHES)).toEqual([]);
  });

  it('keeps two unrelated miswirings as two separate drift clusters', () => {
    const matches: readonly ResourceMatch[] = [
      ...IDENTITY_MATCHES,
      { authoredSlug: 'write-fn', actualSlug: 'write-fn', rung: 'tuple' },
      { authoredSlug: 'cache', actualSlug: 'cache', rung: 'tuple' },
    ];
    const authored: readonly ResolvedConnection[] = [
      { from: 'app-service', to: 'sql', class: 'primary' },
      { from: 'write-fn', to: 'cache', class: 'primary' },
    ];
    const actual: readonly DerivedConnection[] = [];

    const result = diffConnections(authored, actual, matches);

    expect(result).toHaveLength(2);
    expect(result.map((d) => d.slugs)).toEqual([
      ['app-service', 'sql'],
      ['cache', 'write-fn'],
    ]);
  });
});
