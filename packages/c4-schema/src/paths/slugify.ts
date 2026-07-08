const NON_ALPHANUMERIC = /[^a-z0-9]+/g;
const LEADING_TRAILING_HYPHENS = /^-|-$/g;
const MAX_SLUG_LENGTH = 64;

/**
 * Normalizes free text into a WorkSpec slug: lowercase, every run of
 * non-alphanumeric characters collapsed to a single `-`, leading/trailing
 * hyphens trimmed, then capped at 64 characters — exactly Enterprise's
 * `slugify` in `artifacts/api-server/src/services/artifact-paths.ts`,
 * including the operation order: the cap happens AFTER the trim, with no
 * second trim, so a slug whose 64-char cut lands on a `-` keeps that
 * trailing hyphen (identical output to Enterprise for the same input).
 * Slugs are the filename (minus `.yaml`) for every C4 artifact — this is
 * the one place that mapping is produced from arbitrary user input.
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(NON_ALPHANUMERIC, '-')
    .replace(LEADING_TRAILING_HYPHENS, '')
    .slice(0, MAX_SLUG_LENGTH);
}
