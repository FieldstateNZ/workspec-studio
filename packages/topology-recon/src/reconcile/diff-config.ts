import type { ConfigKeyDiff } from '../model/drift.types.js';

function isDeepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((v, i) => isDeepEqual(v, b[i]))
    );
  }
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;

  const aRecord = a as Record<string, unknown>;
  const bRecord = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(aRecord), ...Object.keys(bRecord)]);
  return [...keys].every((key) => isDeepEqual(aRecord[key], bRecord[key]));
}

/**
 * Diffs two resolved `config` bags key-by-key — spec §4's `divergent` class
 * requires "the specific differing keys ... not just a boolean". A key
 * present on only one side counts as differing (the absent side reports
 * `undefined`). Comparison is deep: a resolved `config` bag is an open,
 * provider-specific record (`ResourceSpec.config`), so a shallow `!==` would
 * miss a changed value nested inside it.
 */
export function diffConfig(
  authored: Record<string, unknown> | null,
  actual: Record<string, unknown> | null,
): readonly ConfigKeyDiff[] {
  const authoredBag = authored ?? {};
  const actualBag = actual ?? {};
  const keys = new Set([...Object.keys(authoredBag), ...Object.keys(actualBag)]);

  return [...keys]
    .filter((key) => !isDeepEqual(authoredBag[key], actualBag[key]))
    .sort()
    .map((key) => ({ key, authored: authoredBag[key], actual: actualBag[key] }));
}
