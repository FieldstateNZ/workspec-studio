/** Which matcher rung produced a given pairing (spec §4: rung 1 is tried before rung 2). */
export type MatchRung = 'source' | 'tuple';

/** One authored↔actual resource pairing produced by `matchResources`. */
export interface ResourceMatch {
  readonly authoredSlug: string;
  readonly actualSlug: string;
  readonly rung: MatchRung;
}

/**
 * The full output of `matchResources`: every one-to-one pairing found, plus
 * the authored/actual slugs that matched nothing at all — `reconcile()`'s
 * `phantom` and `orphan` candidates respectively.
 */
export interface MatchResult {
  readonly matches: readonly ResourceMatch[];
  readonly unmatchedAuthored: readonly string[];
  readonly unmatchedActual: readonly string[];
}
