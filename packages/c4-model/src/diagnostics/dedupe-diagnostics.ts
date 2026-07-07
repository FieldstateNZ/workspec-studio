import type { C4Diagnostic } from '../model/diagnostic.types.js';

/**
 * Drops exact-duplicate diagnostics, keeping first-seen order. Used only
 * where the same underlying problem is legitimately discovered twice by
 * construction — `c4-container` resolves its logical and deployment lenses
 * independently, so a typed ref that's dangling (lens-independent) or an
 * edge that appears under `lens: both` (present in both resolution passes)
 * would otherwise report the identical finding twice.
 */
export function dedupeDiagnostics(diagnostics: readonly C4Diagnostic[]): C4Diagnostic[] {
  const seen = new Set<string>();
  const result: C4Diagnostic[] = [];
  for (const diagnostic of diagnostics) {
    const key = JSON.stringify(diagnostic);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(diagnostic);
    }
  }
  return result;
}
