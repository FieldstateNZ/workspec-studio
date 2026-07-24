import type { ResolvedResource } from '@workspec/topology-model';
import type { DerivedResource } from '../model/derived-topology.types.js';
import type { MatchResult, ResourceMatch } from './match-resources.types.js';

function bySlug<T extends { readonly slug: string }>(resources: readonly T[]): Map<string, T> {
  return new Map(resources.map((resource) => [resource.slug, resource]));
}

/** `2` when both sides carry an equal, defined `resourceGroup`; `1` when the field is wildcarded (either side `null`); `0` when not a candidate at all. */
function tupleScore(authored: ResolvedResource, actual: DerivedResource): 0 | 1 | 2 {
  if (
    authored.kind !== actual.kind ||
    authored.type !== actual.type ||
    authored.name !== actual.name
  )
    return 0;
  if (authored.resourceGroup !== null && actual.resourceGroup !== null) {
    return authored.resourceGroup === actual.resourceGroup ? 2 : 0;
  }
  return 1;
}

/**
 * Builds a left→right adjacency list for Kuhn's algorithm: for every left
 * (authored) slug, every right (actual) slug `isCandidate` accepts, in the
 * same ascending order `rightSlugs` was given in. Callers always pass
 * pre-sorted slug arrays, so every adjacency list comes out sorted too —
 * `kuhnMaximumMatching`'s determinism depends on this.
 */
function buildAdjacency(
  leftSlugs: readonly string[],
  rightSlugs: readonly string[],
  isCandidate: (left: string, right: string) => boolean,
): ReadonlyMap<string, readonly string[]> {
  return new Map(
    leftSlugs.map((left) => [left, rightSlugs.filter((right) => isCandidate(left, right))]),
  );
}

/**
 * Kuhn's augmenting-path algorithm: a MAXIMUM-cardinality bipartite matching
 * (not merely maximal) over `adjacency`, the general case a greedy
 * "highest-score-first" assignment provably fails on — greedy can strand a
 * pair that a global rearrangement would have matched (see the module doc's
 * `a1/a2/x1/x2` example). Deterministic given sorted input: `leftSlugs` and
 * every adjacency list are iterated in ascending order, so the augmenting
 * path search always explores candidates in the same order regardless of
 * the caller's original array order — the same maximum matching comes out
 * every time for the same underlying resource sets.
 */
function kuhnMaximumMatching(
  leftSlugs: readonly string[],
  adjacency: ReadonlyMap<string, readonly string[]>,
): ReadonlyMap<string, string> {
  const matchOfRight = new Map<string, string>();

  function tryAugment(left: string, visitedRight: Set<string>): boolean {
    for (const right of adjacency.get(left) ?? []) {
      if (visitedRight.has(right)) continue;
      visitedRight.add(right);

      const incumbent = matchOfRight.get(right);
      if (incumbent === undefined || tryAugment(incumbent, visitedRight)) {
        matchOfRight.set(right, left);
        return true;
      }
    }
    return false;
  }

  for (const left of leftSlugs) tryAugment(left, new Set());

  return matchOfRight;
}

/**
 * Matches every derived (actual) resource to at most one authored resource —
 * THE NORMATIVE matcher (spec §4). Two rungs, tried in this order, each only
 * considering resources neither rung has already claimed:
 *
 * 1. **`source.from` equality.** Authored resources rarely set `source.from`
 *    (typically only a derived/re-imported one would); this rung mostly
 *    matches derived-vs-derived across re-imports, but is implemented
 *    unconditionally as the first rung per the contract — a resource on
 *    EITHER side missing `source.from` simply can't match at this rung and
 *    falls through to rung 2. On a duplicate `source.from` across authored
 *    resources (a data inconsistency that shouldn't occur, but the matcher
 *    must stay deterministic if it does), the lexicographically smallest
 *    authored slug wins — resources are processed in sorted-slug order on
 *    both sides, so the result never depends on input array order.
 * 2. **The `(kind, type, resourceGroup, name)` tuple**, resolved as a
 *    MAXIMUM-CARDINALITY bipartite matching (`kuhnMaximumMatching`), not a
 *    greedy assignment. `kind`, `type`, and `name` (the human `spec.name`)
 *    must match exactly. `resourceGroup` is a wildcard whenever EITHER side
 *    is `null`: `@workspec/topology-adapters`' bicep adapter never sets it
 *    at all, and even when both sides do carry one, authored and derived
 *    resource-group slugs only coincide by chance (see that package's
 *    README) — so a defined-vs-defined MISMATCH is a genuine non-match, but
 *    a defined-vs-`null` pair must not be forced to fail just because one
 *    side couldn't observe the field.
 *
 *    Run as two passes so an exact-resourceGroup match is always preferred
 *    over a wildcard one WITHOUT sacrificing overall cardinality: pass 1
 *    computes a maximum matching using ONLY score-2 (exact-resourceGroup)
 *    candidates and locks it in; pass 2 computes a maximum matching over the
 *    vertices pass 1 left untouched, using the remaining score-1 (wildcard)
 *    candidates. Pass 1's result is never revisited — a resource it matched
 *    can't be reassigned by pass 2 — but this doesn't cost cardinality: pass
 *    1 being *maximum* on the score-2 subgraph means no score-2 edge
 *    connects two of its leftover vertices (if one did, pass 1 itself would
 *    have used it), and every candidate that could route an augmenting path
 *    "through" a locked pass-1 pair is a wildcard edge — which, given the
 *    tuple's exact-`kind`/`type`/`name` precondition, is always mirrored by
 *    a direct wildcard edge between the two leftover endpoints themselves
 *    (they already have to share that same `(kind, type, name)` for such a
 *    path to exist), so pass 2 finds it directly without needing to disturb
 *    pass 1 at all.
 *
 * Matching is stable and one-to-one throughout: once a resource is claimed
 * at any rung/pass it is removed from the pool for every later step, so no
 * resource is ever paired twice.
 */
export function matchResources(
  authored: readonly ResolvedResource[],
  actual: readonly DerivedResource[],
): MatchResult {
  const authoredPool = bySlug(authored);
  const actualPool = bySlug(actual);
  const matches: ResourceMatch[] = [];

  // Rung 1: source.from equality.
  const authoredSlugBySource = new Map<string, string>();
  const authoredBySlugSorted = [...authoredPool.values()].sort((a, b) =>
    a.slug.localeCompare(b.slug),
  );
  for (const resource of authoredBySlugSorted) {
    if (resource.source?.from && !authoredSlugBySource.has(resource.source.from)) {
      authoredSlugBySource.set(resource.source.from, resource.slug);
    }
  }
  const actualBySlugSorted = [...actualPool.values()].sort((a, b) => a.slug.localeCompare(b.slug));
  for (const resource of actualBySlugSorted) {
    const from = resource.source?.from;
    const authoredSlug = from ? authoredSlugBySource.get(from) : undefined;
    if (!authoredSlug || !authoredPool.has(authoredSlug)) continue;

    matches.push({ authoredSlug, actualSlug: resource.slug, rung: 'source' });
    authoredPool.delete(authoredSlug);
    actualPool.delete(resource.slug);
  }

  // Rung 2, pass 1: maximum matching using only exact-resourceGroup (score-2) candidates.
  const afterSourceAuthoredSlugs = [...authoredPool.keys()].sort();
  const afterSourceActualSlugs = [...actualPool.keys()].sort();
  const exactAdjacency = buildAdjacency(
    afterSourceAuthoredSlugs,
    afterSourceActualSlugs,
    (a, x) => {
      const authoredResource = authoredPool.get(a);
      const actualResource = actualPool.get(x);
      return (
        authoredResource !== undefined &&
        actualResource !== undefined &&
        tupleScore(authoredResource, actualResource) === 2
      );
    },
  );
  for (const [actualSlug, authoredSlug] of kuhnMaximumMatching(
    afterSourceAuthoredSlugs,
    exactAdjacency,
  )) {
    matches.push({ authoredSlug, actualSlug, rung: 'tuple' });
    authoredPool.delete(authoredSlug);
    actualPool.delete(actualSlug);
  }

  // Rung 2, pass 2: maximum matching over the leftover vertices, using wildcarded (score-1) candidates.
  const leftoverAuthoredSlugs = [...authoredPool.keys()].sort();
  const leftoverActualSlugs = [...actualPool.keys()].sort();
  const wildcardAdjacency = buildAdjacency(leftoverAuthoredSlugs, leftoverActualSlugs, (a, x) => {
    const authoredResource = authoredPool.get(a);
    const actualResource = actualPool.get(x);
    return (
      authoredResource !== undefined &&
      actualResource !== undefined &&
      tupleScore(authoredResource, actualResource) >= 1
    );
  });
  for (const [actualSlug, authoredSlug] of kuhnMaximumMatching(
    leftoverAuthoredSlugs,
    wildcardAdjacency,
  )) {
    matches.push({ authoredSlug, actualSlug, rung: 'tuple' });
    authoredPool.delete(authoredSlug);
    actualPool.delete(actualSlug);
  }

  return {
    matches: [...matches].sort((a, b) => a.authoredSlug.localeCompare(b.authoredSlug)),
    unmatchedAuthored: [...authoredPool.keys()].sort(),
    unmatchedActual: [...actualPool.keys()].sort(),
  };
}
