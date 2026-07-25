/**
 * Filters an array of `unknown` down to the strings it contains, dropping any
 * non-string entries. Used when copying a vendor list attribute (e.g. a
 * Terraform `address_space`) into a Resource's `config` bag, where we want a
 * plain `string[]` rather than propagating unknown-typed JSON.
 */
export function stringArray(values: readonly unknown[] | undefined): readonly string[] | undefined {
  if (!values) return undefined;
  const strings = values.filter((value): value is string => typeof value === 'string');
  return strings.length > 0 ? strings : undefined;
}
