import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { mapErrorToResult } from '@workspec/mcp-core';
import { RefEscapesRootError } from '../fs-repository.js';

/**
 * Maps a thrown error from a `trace` MCP tool to an `isError` `CallToolResult`.
 * Built on `@workspec/mcp-core`'s shared {@link mapErrorToResult} — that
 * shared function already handles the generic `InvalidRefError`/`ENOENT`/
 * no-leak fallback cases; this module classifies ONE trace-studio-specific
 * error type on top:
 *
 * - {@link RefEscapesRootError} → a ref-escapes-root message.
 *
 * Unlike `@workspec/c4-studio` (which has no repo-specific error type left to
 * classify, since its `C4FileSource` throws only raw Node fs errors),
 * `RefEscapesRootError` is a REAL throw path here: `emit`'s `out` and
 * `ingest`'s `runsDir` both feed into a `FsRepository.writeFile` ref built
 * from caller-supplied strings (`posix.join(out, file.path)` /
 * `posix.join(runsDir, "<id>.json")`), so a caller passing `out: "../.."` (or
 * similar) hits this classifier, not the generic ENOENT/internal-error
 * fallback. There is no `ArtifactValidationError`-equivalent to classify:
 * `FsRepository` returns validation problems as `LoadIssue[]` DATA (never
 * throws them) — see `repository.ts`'s own doc comment.
 */
export function mapTraceErrorToResult(error: unknown, ref?: string): CallToolResult {
  return mapErrorToResult(error, {
    // Only include `ref` when defined: `MapErrorToResultOptions.ref` is
    // plain-optional, and this repo's `exactOptionalPropertyTypes` rejects
    // an explicit `ref: undefined` as distinct from the key being absent.
    ...(ref !== undefined ? { ref } : {}),
    logPrefix: 'trace mcp',
    classify: (err) => {
      if (err instanceof RefEscapesRootError) {
        return { content: [{ type: 'text', text: 'ref escapes served root' }], isError: true };
      }
      return undefined;
    },
  });
}
