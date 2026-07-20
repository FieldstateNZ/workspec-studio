import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { mapRepoErrorToResult } from './map-repo-error-to-result.js';

/** One issue from a Zod `safeParse` failure — only the shape this module needs, so it stays zod-import-free. */
interface SafeParseIssue {
  readonly path: (string | number)[];
  readonly message: string;
}

/** The subset of Zod's `SafeParseReturnType` this module needs, structurally — no `zod` import required. */
export type SafeParseOutcome<T> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: { readonly issues: SafeParseIssue[] } };

/**
 * The shared "validate, then write, then report" flow behind the
 * `write_catalog` and `write_decision` tools. `parseResult` is already the
 * artifact schema's `safeParse` output — the caller owns the actual Zod
 * schema (`CatalogArtifact`/`DecisionArtifact`) — so this function only
 * needs its shape, and can be reused for both artifact kinds without this
 * module importing `zod` itself.
 *
 * On a validation failure, returns an `isError` result carrying the located
 * issues and — critically — never calls `write`, so an invalid artifact
 * never reaches disk.
 */
export async function validateThenWrite<T>(
  parseResult: SafeParseOutcome<T>,
  ref: string,
  write: (ref: string, data: T) => Promise<void>,
  kind: 'catalog' | 'decision',
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
    return mapRepoErrorToResult(error, ref);
  }
  return { content: [{ type: 'text', text: `wrote ${kind} "${ref}"` }] };
}
