import { readStringArg } from './read-string-arg.js';

/**
 * The shape a WorkSpec slug must have: lowercase alphanumeric segments
 * joined by single hyphens, no leading/trailing hyphen. Mirrors
 * `@workspec/schema-core`'s `SLUG_PATTERN`
 * (`packages/schema-core/src/schemas/common/slug.ts`) — duplicated here
 * rather than imported because `mcp-core` deliberately depends on neither
 * zod nor `@workspec/schema-core` (see this package's `index.ts` header).
 * If `SLUG_PATTERN` ever changes there, this must change with it.
 */
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * The maximum slug length. Mirrors `@workspec/schema-core`'s
 * `MAX_SLUG_LENGTH` — see {@link SLUG_PATTERN}'s doc comment for why this is
 * a local duplicate rather than an import, and why it must stay in sync.
 */
const MAX_SLUG_LENGTH = 64;

/**
 * Thrown by {@link readSlugArg} when a value is ill-shaped. A dedicated type
 * so {@link import('./map-error-to-result.js').mapErrorToResult} can map it
 * to a clean, client-safe `isError` message (a client-input problem, not an
 * internal fault) rather than the generic "internal error" scrub. The
 * message names only the argument — never the offending value.
 */
export class InvalidSlugError extends Error {
  constructor(key: string) {
    super(`argument "${key}" is not a valid slug`);
    this.name = 'InvalidSlugError';
  }
}

/**
 * Reads a required slug field (e.g. an environment slug) from an MCP tool
 * call's `unknown` args and rejects any ill-shaped value up front, before it
 * reaches a repository — via the same {@link SLUG_PATTERN}/length rule
 * `@workspec/schema-core`'s `Slug` schema enforces. Rejecting here matters
 * for callers that build a path from the slug (e.g. `posix.join('.topology-actual',
 * envSlug)`): a value like `../../etc` is a bare string by the JSON Schema
 * the tool advertises, so nothing upstream of this call stops it. Path
 * containment via the module's own repository `resolve()` still backstops
 * this; this is the first-line shape check.
 *
 * Throws {@link InvalidSlugError} (ill-shaped) or a plain `Error`
 * (missing/non-string, from {@link readStringArg}). Each tool calls this
 * inside its own try block and routes the throw through its module's own
 * error mapper (built on {@link import('./map-error-to-result.js').mapErrorToResult}),
 * so it surfaces as an `isError` result — never an uncaught crash.
 */
export function readSlugArg(args: unknown, key: string): string {
  const value = readStringArg(args, key);
  if (value.length > MAX_SLUG_LENGTH || !SLUG_PATTERN.test(value)) {
    throw new InvalidSlugError(key);
  }
  return value;
}
