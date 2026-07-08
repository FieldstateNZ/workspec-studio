/**
 * Recursively sorts object keys (alphabetically) throughout a JSON value,
 * leaving array order untouched. `z.toJSONSchema`'s own key order already
 * tends to follow schema definition order, but this makes the committed
 * output byte-stable across Zod versions and regenerations regardless —
 * required for the drift test to be a meaningful guard rather than a
 * source of spurious diffs.
 */
export function sortJsonKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonKeys);
  }
  if (value !== null && typeof value === 'object') {
    const sortedEntries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entryValue]) => [key, sortJsonKeys(entryValue)] as const);
    return Object.fromEntries(sortedEntries);
  }
  return value;
}
