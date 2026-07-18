import { MAX_SLUG_LENGTH } from '../schemas/common/slug.js';

const NON_ALPHANUMERIC = /[^a-z0-9]+/g;
const LEADING_TRAILING_HYPHENS = /^-|-$/g;

/**
 * Normalizes free text into a WorkSpec slug: lowercase, every run of
 * non-alphanumeric characters collapsed to a single `-`, leading/trailing
 * hyphens trimmed, then capped at 64 characters — same shape (and operation
 * order: the cap happens AFTER the trim, with no second trim, so a slug
 * whose 64-char cut lands on a `-` keeps that trailing hyphen) as
 * `@workspec/c4-schema`'s `slugify`. Slugs are the filename (minus
 * `.yaml`) for every WorkSpec artifact — this is the one place that mapping
 * is produced from arbitrary user input.
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(NON_ALPHANUMERIC, '-')
    .replace(LEADING_TRAILING_HYPHENS, '')
    .slice(0, MAX_SLUG_LENGTH);
}
