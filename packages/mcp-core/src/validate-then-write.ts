import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * One issue from a Zod `safeParse` failure — only the shape this module
 * needs, so it stays zod-import-free. `path` is `PropertyKey[]` (not
 * `(string | number)[]`) to match Zod 4's `$ZodIssue.path`, which can in
 * principle contain a `symbol` segment (never happens for the string/number
 * object and array keys real artifacts use, but the type must still widen to
 * satisfy structural assignability from a real `ZodError`).
 */
interface SafeParseIssue {
  readonly path: readonly PropertyKey[];
  readonly message: string;
}

/** The subset of Zod's `SafeParseReturnType` this module needs, structurally — no `zod` import required. */
export type SafeParseOutcome<T> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: { readonly issues: SafeParseIssue[] } };

/**
 * The shared "validate, then write, then report" flow behind every
 * `write_*` tool across every `*-studio` MCP provider. `parseResult` is
 * already the artifact schema's `safeParse` output — the caller owns the
 * actual Zod schema — so this function only needs its shape, and can be
 * reused for any artifact kind without this package importing `zod` itself.
 *
 * On a validation failure, returns an `isError` result carrying the located
 * issues and — critically — never calls `write`, so an invalid artifact
 * never reaches disk.
 *
 * `mapError` is the caller's own module-specific error mapper (e.g. a
 * `mapRepoErrorToResult` built on {@link import('./map-error-to-result.js').mapErrorToResult}) —
 * this function stays zero-knowledge of any particular repository's error
 * types, which is what keeps error *classification* in-module while the
 * validate/write/report *flow* is shared.
 */
export async function validateThenWrite<T>(
  parseResult: SafeParseOutcome<T>,
  ref: string,
  write: (ref: string, data: T) => Promise<void>,
  kind: string,
  mapError: (error: unknown, ref: string) => CallToolResult,
): Promise<CallToolResult> {
  if (!parseResult.success) {
    const issues = parseResult.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: `invalid ${kind}`, issues }) }],
      isError: true,
    };
  }
  try {
    await write(ref, parseResult.data);
  } catch (error) {
    return mapError(error, ref);
  }
  return { content: [{ type: 'text', text: `wrote ${kind} "${ref}"` }] };
}
