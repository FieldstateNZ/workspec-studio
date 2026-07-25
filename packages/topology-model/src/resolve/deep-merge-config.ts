function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Deep-merges `patch` onto `base`: plain objects merge key-by-key
 * (recursively); arrays and primitives in `patch` fully replace the
 * corresponding value in `base` rather than merging element-wise. This is
 * step 3 of the `resolve()` contract (spec §3.3) applied to a resource's
 * open `spec.config` bag — the override always wins, and "arrays replace"
 * means an author can shrink or reorder a config array from an environment
 * override without fighting a merge algorithm that tries to be clever about
 * array indices.
 *
 * Returns `null` when both `base` and `patch` are absent, so callers can
 * tell "this resource genuinely has no config" apart from "config merged to
 * an empty object" without an extra check.
 */
export function deepMergeConfig(
  base: Record<string, unknown> | undefined,
  patch: Record<string, unknown> | undefined,
): Record<string, unknown> | null {
  if (base === undefined && patch === undefined) return null;
  return mergeObjects(base ?? {}, patch ?? {});
}

function mergeObjects(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const [key, patchValue] of Object.entries(patch)) {
    const baseValue = result[key];
    if (isPlainObject(baseValue) && isPlainObject(patchValue)) {
      result[key] = mergeObjects(baseValue, patchValue);
    } else {
      result[key] = patchValue;
    }
  }
  return result;
}
