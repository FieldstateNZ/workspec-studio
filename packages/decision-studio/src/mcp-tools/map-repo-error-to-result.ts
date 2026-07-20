import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ArtifactValidationError, RefEscapesRootError } from '../fs-repository.js';
import { InvalidRefError } from './read-ref-arg.js';

/**
 * Maps a thrown `FsRepository` (or ref-reading) error to an `isError`
 * `CallToolResult`, mirroring `server.ts`'s HTTP error classification
 * (`sendReadError`/`sendInternalError`) so the HTTP API and the MCP surface
 * treat the same failures the same way:
 *
 * - {@link InvalidRefError} → a client-safe "not a valid repo-relative path"
 *   message (the MCP analogue of the REST layer's 400 "invalid ref").
 * - {@link RefEscapesRootError} → a ref-escapes-root message.
 * - {@link ArtifactValidationError} → the located parse/validation issues.
 * - `ENOENT` → "not found".
 * - anything else → a generic message, with the real error logged to stderr
 *   (never stdout — that's the MCP stdio protocol channel) and never sent to
 *   the client, since an unclassified Node error's `.message` can carry the
 *   served root's absolute filesystem path.
 */
export function mapRepoErrorToResult(error: unknown, ref?: string): CallToolResult {
  if (error instanceof InvalidRefError) {
    return { content: [{ type: 'text', text: error.message }], isError: true };
  }
  if (error instanceof RefEscapesRootError) {
    return { content: [{ type: 'text', text: 'ref escapes served root' }], isError: true };
  }
  if (error instanceof ArtifactValidationError) {
    const issues = error.issues.map((issue) => ({ path: issue.path, message: issue.message }));
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: 'invalid artifact', ref: error.ref, issues }) }],
      isError: true,
    };
  }
  if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
    return { content: [{ type: 'text', text: 'not found' }], isError: true };
  }
  if (ref !== undefined) {
    console.error('[decisions mcp] unhandled error, ref:', ref, error);
  } else {
    console.error('[decisions mcp] unhandled error:', error);
  }
  return { content: [{ type: 'text', text: 'internal error' }], isError: true };
}
