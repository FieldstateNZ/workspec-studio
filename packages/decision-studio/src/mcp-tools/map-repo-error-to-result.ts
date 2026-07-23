import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { mapErrorToResult } from '@workspec/mcp-core';
import { ArtifactValidationError, RefEscapesRootError } from '../fs-repository.js';

/**
 * Maps a thrown `FsRepository` (or ref-reading) error to an `isError`
 * `CallToolResult`, mirroring `server.ts`'s HTTP error classification
 * (`sendReadError`/`sendInternalError`) so the HTTP API and the MCP surface
 * treat the same failures the same way. Built on `@workspec/mcp-core`'s
 * shared {@link mapErrorToResult} — that shared function already handles the
 * generic `InvalidRefError`/`ENOENT`/no-leak-fallback cases; this module only
 * classifies decisions' own repository error types:
 *
 * - {@link RefEscapesRootError} → a ref-escapes-root message.
 * - {@link ArtifactValidationError} → the located parse/validation issues.
 */
export function mapRepoErrorToResult(error: unknown, ref?: string): CallToolResult {
  return mapErrorToResult(error, {
    // Only include `ref` when defined: `MapErrorToResultOptions.ref` is
    // plain-optional, and this repo's `exactOptionalPropertyTypes` rejects
    // an explicit `ref: undefined` as distinct from the key being absent.
    ...(ref !== undefined ? { ref } : {}),
    logPrefix: 'decisions mcp',
    classify: (err) => {
      if (err instanceof RefEscapesRootError) {
        return { content: [{ type: 'text', text: 'ref escapes served root' }], isError: true };
      }
      if (err instanceof ArtifactValidationError) {
        const issues = err.issues.map((issue) => ({ path: issue.path, message: issue.message }));
        return {
          content: [
            { type: 'text', text: JSON.stringify({ error: 'invalid artifact', ref: err.ref, issues }) },
          ],
          isError: true,
        };
      }
      return undefined;
    },
  });
}
