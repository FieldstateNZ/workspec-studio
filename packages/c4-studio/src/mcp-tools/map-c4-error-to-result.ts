import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { RefEscapesRootError } from '@workspec/c4-model/fs';
import { mapErrorToResult } from '@workspec/mcp-core';

/**
 * Maps a thrown error from a `c4` MCP tool to an `isError` `CallToolResult`.
 * A thin wrapper over `@workspec/mcp-core`'s shared {@link mapErrorToResult}
 * with one `classify` case: `@workspec/c4-model`'s `createFsSource` throws
 * {@link RefEscapesRootError} when a path resolves outside the served root
 * (see its own doc comment) — classified here the same way
 * `@workspec/decision-studio`'s and `@workspec/cost-studio`'s equivalents
 * classify their `FsRepository`'s `RefEscapesRootError`. Every `c4` tool
 * still routes every catch through this function (rather than hand-rolling
 * its own error text) so the no-leak/logging guarantee stays shared with
 * every other `*-studio` MCP provider.
 */
export function mapC4ErrorToResult(error: unknown, ref?: string): CallToolResult {
  return mapErrorToResult(error, {
    // Only include `ref` when defined: `MapErrorToResultOptions.ref` is
    // plain-optional, and this repo's `exactOptionalPropertyTypes` rejects
    // an explicit `ref: undefined` as distinct from the key being absent.
    ...(ref !== undefined ? { ref } : {}),
    logPrefix: 'c4 mcp',
    classify: (err) => {
      if (err instanceof RefEscapesRootError) {
        return { content: [{ type: 'text', text: 'ref escapes served root' }], isError: true };
      }
      return undefined;
    },
  });
}
