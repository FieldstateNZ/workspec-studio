// Pure ordering primitives shared by every derivation module: a stable
// string comparator and a dedupe+sort helper. Keeping these in one place is
// what makes every model array slug-sorted the same way, which is what makes
// the engine deterministic (identical input must yield identical output).

/** Lexicographic string compare (stable, locale-independent) — the ordering primitive. */
export function byString(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** A fresh sorted, deduplicated copy of a string array (never mutates the input). */
export function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort(byString);
}
