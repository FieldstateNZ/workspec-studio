import { isSafeRelativeRef } from '../ref-shape.js';
import { readStringArg } from './read-string-arg.js';

/**
 * Thrown by {@link readRefArg} when a ref is ill-shaped. A dedicated type so
 * {@link import('./map-repo-error-to-result.js').mapRepoErrorToResult} can map
 * it to a clean, client-safe `isError` message (a client-input problem, not
 * an internal fault) rather than the generic "internal error" scrub. The
 * message names only the argument — never the offending value or any server
 * path.
 */
export class InvalidRefError extends Error {
  constructor(key: string) {
    super(`argument "${key}" is not a valid repo-relative path`);
    this.name = 'InvalidRefError';
  }
}

/**
 * Reads a required repo-relative-ref field from an MCP tool call's `unknown`
 * args and rejects any ill-shaped ref up front — before it reaches the
 * repository — via the shared {@link isSafeRelativeRef} predicate (the same
 * one `server.ts`'s HTTP `refFrom` uses). Rejecting here matters for the
 * write tools specifically: on POSIX a ref like `..\..\x` would otherwise be
 * treated as one literal filename and create a garbage-named file inside the
 * served root. Containment via `FsRepository.resolve()` still backstops this;
 * this is the first-line shape check.
 *
 * Throws {@link InvalidRefError} (ill-shaped) or a plain `Error`
 * (missing/non-string, from {@link readStringArg}). Each tool calls this
 * inside its own try block and routes the throw through `mapRepoErrorToResult`,
 * so it surfaces as an `isError` result — never an uncaught crash.
 */
export function readRefArg(args: unknown, key: string): string {
  const ref = readStringArg(args, key);
  if (!isSafeRelativeRef(ref)) {
    throw new InvalidRefError(key);
  }
  return ref;
}
