/**
 * Narrows an `unknown` value to a plain JSON object (`Record<string, unknown>`).
 * Every adapter consumes already-parsed JSON of unknown shape (state/plan
 * dumps, ARM templates, query results) — this is the base guard the rest of
 * the `json/` helpers build on before indexing into that JSON.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
