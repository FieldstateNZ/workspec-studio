const NON_ALPHANUMERIC = /[^a-z0-9]+/g;
const LEADING_TRAILING_HYPHENS = /^-|-$/g;
const MAX_SLUG_LENGTH = 64;

/**
 * Normalizes free text into a WorkSpec slug: lowercase, every run of
 * non-alphanumeric characters collapsed to a single `-`, leading/trailing
 * hyphens trimmed, then capped at 64 characters. Deliberately mirrors
 * `@workspec/schema-core`'s `slugify` byte-for-byte rather than importing
 * it: this package's only workspace dependency is `@workspec/topology-schema`
 * (per the build brief), and `slugify` isn't re-exported from there. Every
 * derived resource's `metadata.slug` and its `network`/`resourceGroup` refs
 * go through this function, so cross-references between derived resources
 * stay self-consistent even though this is a separate implementation from
 * schema-core's.
 */
export function toSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(NON_ALPHANUMERIC, '-')
    .replace(LEADING_TRAILING_HYPHENS, '')
    .slice(0, MAX_SLUG_LENGTH);
}
