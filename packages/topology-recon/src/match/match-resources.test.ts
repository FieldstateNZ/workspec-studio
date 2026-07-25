import { describe, expect, it } from 'vitest';
import type { ResolvedResource } from '@workspec/topology-model';
import type { DerivedResource } from '../model/derived-topology.types.js';
import { matchResources } from './match-resources.js';

function authoredResource(overrides: Partial<ResolvedResource> = {}): ResolvedResource {
  return {
    slug: 'app-service',
    name: 'App Service',
    kind: 'compute',
    type: 'Azure App Service',
    provider: 'azure',
    network: null,
    resourceGroup: 'rg-app',
    realizes: [],
    config: null,
    cost: null,
    source: null,
    ...overrides,
  };
}

function actualResource(overrides: Partial<DerivedResource> = {}): DerivedResource {
  return {
    slug: 'app-service-1',
    name: 'App Service',
    kind: 'compute',
    type: 'Azure App Service',
    provider: 'azure',
    resourceGroup: 'rg-app',
    config: null,
    cost: null,
    source: { kind: 'derived', from: 'azurerm_linux_web_app.web' },
    ...overrides,
  };
}

describe('matchResources', () => {
  it('rung 1: matches on equal source.from, ignoring every other field', () => {
    const authored = authoredResource({
      slug: 'app-service',
      name: 'Totally Different Name',
      resourceGroup: 'rg-other',
      source: { kind: 'authored', from: 'azurerm_linux_web_app.web' },
    });
    const actual = actualResource({ slug: 'app-service-1' });

    const result = matchResources([authored], [actual]);

    expect(result.matches).toEqual([
      { authoredSlug: 'app-service', actualSlug: 'app-service-1', rung: 'source' },
    ]);
    expect(result.unmatchedAuthored).toEqual([]);
    expect(result.unmatchedActual).toEqual([]);
  });

  it('rung 2: falls back to the (kind, type, resourceGroup, name) tuple when source.from is absent', () => {
    const authored = authoredResource({ slug: 'app-service', source: null });
    const actual = actualResource({ slug: 'app-service-1', source: null });

    const result = matchResources([authored], [actual]);

    expect(result.matches).toEqual([
      { authoredSlug: 'app-service', actualSlug: 'app-service-1', rung: 'tuple' },
    ]);
  });

  it('rung 2: a defined-vs-defined resourceGroup mismatch is a genuine non-match, not a wildcard', () => {
    const authored = authoredResource({ slug: 'app-service', resourceGroup: 'rg-a', source: null });
    const actual = actualResource({ slug: 'app-service-1', resourceGroup: 'rg-b', source: null });

    const result = matchResources([authored], [actual]);

    expect(result.matches).toEqual([]);
    expect(result.unmatchedAuthored).toEqual(['app-service']);
    expect(result.unmatchedActual).toEqual(['app-service-1']);
  });

  it('rung 2: wildcards resourceGroup when either side is undefined (null) — authored null, actual defined', () => {
    const authored = authoredResource({ slug: 'app-service', resourceGroup: null, source: null });
    const actual = actualResource({ slug: 'app-service-1', resourceGroup: 'rg-app', source: null });

    const result = matchResources([authored], [actual]);

    expect(result.matches).toEqual([
      { authoredSlug: 'app-service', actualSlug: 'app-service-1', rung: 'tuple' },
    ]);
  });

  it('rung 2: wildcards resourceGroup when either side is undefined (null) — bicep caveat: actual side never sets it', () => {
    const authored = authoredResource({
      slug: 'app-service',
      resourceGroup: 'rg-app',
      source: null,
    });
    const actual = actualResource({ slug: 'app-service-1', resourceGroup: null, source: null });

    const result = matchResources([authored], [actual]);

    expect(result.matches).toEqual([
      { authoredSlug: 'app-service', actualSlug: 'app-service-1', rung: 'tuple' },
    ]);
  });

  it('no-double-match: an exact resourceGroup candidate is preferred over a wildcard one, and no resource is reused', () => {
    // Two authored resources share kind/type/name (only resourceGroup differs).
    // One actual resource has an exact resourceGroup match for "app-a"; the
    // other has no resourceGroup at all (a wildcard candidate for BOTH
    // authored resources). The exact match must win for "app-a", freeing
    // "app-b" to pair with the wildcard candidate instead of either resource
    // being matched twice or left unmatched when it needn't be.
    const authoredA = authoredResource({ slug: 'app-a', resourceGroup: 'rg-a', source: null });
    const authoredB = authoredResource({ slug: 'app-b', resourceGroup: 'rg-b', source: null });
    const actualExact = actualResource({
      slug: 'actual-exact',
      resourceGroup: 'rg-a',
      source: null,
    });
    const actualWildcard = actualResource({
      slug: 'actual-wildcard',
      resourceGroup: null,
      source: null,
    });

    const result = matchResources([authoredA, authoredB], [actualExact, actualWildcard]);

    expect(result.matches).toEqual([
      { authoredSlug: 'app-a', actualSlug: 'actual-exact', rung: 'tuple' },
      { authoredSlug: 'app-b', actualSlug: 'actual-wildcard', rung: 'tuple' },
    ]);
    expect(result.unmatchedAuthored).toEqual([]);
    expect(result.unmatchedActual).toEqual([]);

    // Every slug appears in at most one match — the crux of "no double-matching".
    const authoredSlugs = result.matches.map((m) => m.authoredSlug);
    const actualSlugs = result.matches.map((m) => m.actualSlug);
    expect(new Set(authoredSlugs).size).toBe(authoredSlugs.length);
    expect(new Set(actualSlugs).size).toBe(actualSlugs.length);
  });

  it('an authored resource with no candidate at all is a phantom (unmatchedAuthored), never dropped silently', () => {
    const authored = authoredResource({
      slug: 'search',
      kind: 'search',
      type: 'Azure AI Search',
      source: null,
    });
    const actual = actualResource({ slug: 'app-service-1', source: null });

    const result = matchResources([authored], [actual]);

    expect(result.matches).toEqual([]);
    expect(result.unmatchedAuthored).toEqual(['search']);
    expect(result.unmatchedActual).toEqual(['app-service-1']);
  });

  it('maximum-cardinality: a greedy highest-score-first assignment would strand a1/x2 as a false phantom+orphan; the real matcher does not', () => {
    // All four share (kind, type, name). No score-2 (exact resourceGroup)
    // candidate exists at all: a2 and x2 both carry a defined resourceGroup,
    // but different values ('r1' vs 'r2'), so a2-x2 is a genuine non-match
    // (excluded from candidacy entirely), not merely a low-scoring one. The
    // only valid edges are all score-1 (wildcard): a1-x1, a1-x2, a2-x1. A
    // greedy "take the first highest-score candidate in (authoredSlug,
    // actualSlug) order" assigns a1-x1 first (it sorts before a1-x2),
    // stranding a2 and x2 even though the perfect matching a1-x2/a2-x1
    // exists.
    const a1 = authoredResource({ slug: 'a1', resourceGroup: null, source: null });
    const a2 = authoredResource({ slug: 'a2', resourceGroup: 'r1', source: null });
    const x1 = actualResource({ slug: 'x1', resourceGroup: null, source: null });
    const x2 = actualResource({ slug: 'x2', resourceGroup: 'r2', source: null });

    const result = matchResources([a1, a2], [x1, x2]);

    expect(result.matches).toHaveLength(2);
    expect(result.unmatchedAuthored).toEqual([]);
    expect(result.unmatchedActual).toEqual([]);

    const authoredSlugs = result.matches.map((m) => m.authoredSlug).sort();
    const actualSlugs = result.matches.map((m) => m.actualSlug).sort();
    expect(authoredSlugs).toEqual(['a1', 'a2']);
    expect(actualSlugs).toEqual(['x1', 'x2']);
  });

  it('is independent of input array order: shuffling authored/actual arrays yields the same match set', () => {
    const a1 = authoredResource({ slug: 'a1', resourceGroup: null, source: null });
    const a2 = authoredResource({ slug: 'a2', resourceGroup: 'r1', source: null });
    const x1 = actualResource({ slug: 'x1', resourceGroup: null, source: null });
    const x2 = actualResource({ slug: 'x2', resourceGroup: 'r2', source: null });

    const forward = matchResources([a1, a2], [x1, x2]);
    const shuffled = matchResources([a2, a1], [x2, x1]);

    const normalize = (r: typeof forward) => ({
      matches: [...r.matches].sort((x, y) => x.authoredSlug.localeCompare(y.authoredSlug)),
      unmatchedAuthored: r.unmatchedAuthored,
      unmatchedActual: r.unmatchedActual,
    });

    expect(normalize(shuffled)).toEqual(normalize(forward));
  });

  it('rung 1 collision: a duplicate source.from across authored resources deterministically picks the lexicographically smallest slug', () => {
    const authoredZ = authoredResource({
      slug: 'zeta',
      name: 'Zeta',
      resourceGroup: null,
      source: { kind: 'authored', from: 'shared-provenance' },
    });
    const authoredA = authoredResource({
      slug: 'alpha',
      name: 'Alpha',
      resourceGroup: null,
      source: { kind: 'authored', from: 'shared-provenance' },
    });
    const actualR = actualResource({
      slug: 'actual-1',
      name: 'Alpha',
      source: { kind: 'derived', from: 'shared-provenance' },
    });

    // Same inputs, two different array orders — the collision winner must not depend on either.
    const forward = matchResources([authoredZ, authoredA], [actualR]);
    const reversed = matchResources([authoredA, authoredZ], [actualR]);

    expect(forward.matches).toEqual([
      { authoredSlug: 'alpha', actualSlug: 'actual-1', rung: 'source' },
    ]);
    expect(reversed.matches).toEqual(forward.matches);
  });
});
