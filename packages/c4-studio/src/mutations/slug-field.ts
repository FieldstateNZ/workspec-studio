import { z } from 'zod';

/**
 * The exact shape `@workspec/c4-schema`'s `slugify` can emit: starts with
 * a lowercase alphanumeric, continues with lowercase alphanumerics and
 * hyphens, at most 64 characters total. A trailing hyphen is allowed on
 * purpose — `slugify`'s 64-char cap happens after its trim, so a slug cut
 * at a hyphen keeps it (see `slugify`'s own doc comment).
 */
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

/**
 * Zod field for any client-supplied artifact slug (element or diagram).
 * This is the load-bearing traversal gate for the mutation API: the client
 * never supplies a file path — only slugs and kind enums — and every path
 * is constructed server-side via `artifactPathFor`/`layoutPathFor`. A slug
 * matching this pattern cannot contain `/`, `.`, `\`, or NUL, so a
 * constructed path can never leave its type directory.
 */
export const slugField = z
  .string()
  .regex(SLUG_PATTERN, 'must be a lowercase slug (a-z, 0-9, hyphens; max 64 chars)');
