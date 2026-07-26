/**
 * Merges `patch` onto `base` for a resource's `spec.config` bag: a SHALLOW,
 * top-level merge only — a key present in `patch` replaces `base`'s value at
 * that key WHOLESALE, even when both sides are objects. This is step 3 of
 * the `resolve()` contract (spec §3.3 / S1's override mechanism), applied to
 * `ResourceOverride.config`.
 *
 * **Design decision (frozen, 2026-07-26): shallow, not deep.** v0's
 * predecessor override mechanism (`Environment.spec.overrides[slug].config`,
 * since removed — see `@workspec/topology-schema`'s `environment.ts` history)
 * deep-merged nested objects recursively. S1 deliberately simplifies this to
 * a top-level-only merge: an author overriding `config.sizing` should see
 * exactly the object they wrote, not a surprise splice of leftover keys from
 * the base resource's `config.sizing` they didn't intend to keep. "Arrays
 * replace" falls out of this for free — an array is just another value a
 * named key replaces wholesale.
 *
 * Returns `null` when both `base` and `patch` are absent, so callers can
 * tell "this resource genuinely has no config" apart from "config merged to
 * an empty object" without an extra check.
 */
export function mergeConfig(
  base: Record<string, unknown> | undefined,
  patch: Record<string, unknown> | undefined,
): Record<string, unknown> | null {
  if (base === undefined && patch === undefined) return null;
  return { ...(base ?? {}), ...(patch ?? {}) };
}
