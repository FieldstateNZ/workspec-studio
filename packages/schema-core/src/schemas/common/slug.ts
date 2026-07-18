import { z } from 'zod';

/** The shape `slugify()` produces: lowercase alphanumeric segments joined by single hyphens. */
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** The maximum slug length `slugify()` enforces. */
export const MAX_SLUG_LENGTH = 64;

/**
 * A WorkSpec slug: lowercase alphanumeric segments separated by single
 * hyphens, no leading/trailing hyphen, at most 64 characters — the shape
 * `slugify()` produces. Used to validate a `metadata.slug` an author writes
 * by hand against the same rule the loader would derive from the filename.
 */
export const Slug = z
  .string()
  .max(MAX_SLUG_LENGTH)
  .regex(
    SLUG_PATTERN,
    'must be a valid slug: lowercase alphanumeric segments separated by single hyphens, no leading/trailing hyphen',
  )
  .describe(
    'A WorkSpec slug: lowercase alphanumeric segments separated by single hyphens, at most 64 characters (the shape `slugify()` produces).',
  );

/** Inferred type of a slug. */
export type Slug = z.infer<typeof Slug>;
