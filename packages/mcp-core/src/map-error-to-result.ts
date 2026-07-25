import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { InvalidRefError } from './read-ref-arg.js';
import { InvalidSlugError } from './read-slug-arg.js';

/**
 * A module's own error classifier: given a thrown error, return the
 * `isError` result it maps to, or `undefined` to fall through to
 * {@link mapErrorToResult}'s generic handling. This is the seam that keeps
 * error *classification* in each module (its own repository's error types,
 * e.g. a `RefEscapesRootError` or an `ArtifactValidationError`) while the
 * envelope and no-leak guarantee are shared.
 */
export type ErrorClassifier = (error: unknown) => CallToolResult | undefined;

/** Options for {@link mapErrorToResult}. */
export interface MapErrorToResultOptions {
  /** The ref (if any) the failing operation was for — logged, never sent to the client. */
  ref?: string;
  /** Prefix for the server-side diagnostic log line on an unclassified error (e.g. `"cost mcp"`). */
  logPrefix: string;
  /** The calling module's own classification, tried before the generic ENOENT/fallback handling. */
  classify?: ErrorClassifier;
}

/**
 * Maps a thrown repository (or ref-reading) error to an `isError`
 * `CallToolResult`, shared across every `*-studio` MCP provider so the
 * envelope + no-leak guarantee can't drift between modules:
 *
 * - {@link InvalidRefError} (thrown by `readRefArg`) → a client-safe
 *   "not a valid repo-relative path" message.
 * - {@link InvalidSlugError} (thrown by `readSlugArg`) → a client-safe
 *   "not a valid slug" message.
 * - `opts.classify`, if supplied → the calling module's own error types.
 *   Returning `undefined` falls through to the cases below.
 * - `ENOENT` → "not found".
 * - anything else → a generic "internal error" message, with the real error
 *   logged to stderr (never stdout — that's the MCP stdio protocol channel
 *   for stdio-hosted providers) under `opts.logPrefix`, and never sent to
 *   the client, since an unclassified Node error's `.message` can carry the
 *   served root's absolute filesystem path.
 */
export function mapErrorToResult(error: unknown, opts: MapErrorToResultOptions): CallToolResult {
  if (error instanceof InvalidRefError) {
    return { content: [{ type: 'text', text: error.message }], isError: true };
  }
  if (error instanceof InvalidSlugError) {
    return { content: [{ type: 'text', text: error.message }], isError: true };
  }
  const classified = opts.classify?.(error);
  if (classified !== undefined) return classified;
  if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
    return { content: [{ type: 'text', text: 'not found' }], isError: true };
  }
  // `ref` is client-supplied, so it must not flow into console.error's format-
  // string argument (tainted format string / log injection); pass it as a
  // separate argument instead.
  if (opts.ref !== undefined) {
    console.error(`[${opts.logPrefix}] unhandled error, ref:`, opts.ref, error);
  } else {
    console.error(`[${opts.logPrefix}] unhandled error:`, error);
  }
  return { content: [{ type: 'text', text: 'internal error' }], isError: true };
}
