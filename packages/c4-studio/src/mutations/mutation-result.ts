// The result contract every mutation service in this directory returns.
// Expected failures (missing element, duplicate slug, validation issues)
// flow back as data — never thrown — matching the house Result pattern and
// `@workspec/c4-schema`'s own `ParseResult`. Only truly unexpected failures
// (filesystem errors, bugs) throw, and the router maps those to a generic
// 500 exactly like `server.ts`'s existing handlers.

import type { ParseIssue } from '@workspec/c4-schema';

/**
 * One expected mutation failure: an HTTP-ready status, a human-readable
 * message (safe to send to the client — never contains absolute paths),
 * and, for schema failures, the `ParseIssue`s pinpointing what was wrong.
 * The status set is closed on purpose: anything that isn't a client-caused
 * 400/404/409 is unexpected and should throw instead.
 */
export interface MutationError {
  readonly status: 400 | 404 | 409;
  readonly message: string;
  readonly issues?: readonly ParseIssue[];
}

/**
 * The outcome of a mutation service call: the success value, or a
 * structured {@link MutationError}. Discriminate on `ok`.
 */
export type MutationResult<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: MutationError };

/** Wraps a success value. */
export function mutationOk<T>(value: T): MutationResult<T> {
  return { ok: true, value };
}

/** Wraps an expected failure. `issues` is attached only when provided. */
export function mutationError(
  status: MutationError['status'],
  message: string,
  issues?: readonly ParseIssue[],
): MutationResult<never> {
  return {
    ok: false,
    error: issues !== undefined ? { status, message, issues } : { status, message },
  };
}
