/**
 * The lookup key for one element in an `elementsByKindAndSlug` map: kind +
 * slug together, not slug alone — `@workspec/c4-model` only guarantees slug
 * uniqueness WITHIN a kind (two different kinds may share a slug, which is
 * exactly what its `duplicate-slug` diagnostic warns about for bare
 * references), so a slug-only key could resolve a node's tooltip to the
 * wrong element.
 */
export function elementKey(kind: string, slug: string): string {
  return `${kind}:${slug}`;
}
