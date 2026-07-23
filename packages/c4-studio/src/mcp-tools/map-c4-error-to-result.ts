import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { mapErrorToResult } from '@workspec/mcp-core';

/**
 * Maps a thrown error from a `c4` MCP tool to an `isError` `CallToolResult`.
 * A thin wrapper over `@workspec/mcp-core`'s shared {@link mapErrorToResult}
 * with NO `classify` callback: unlike `@workspec/cost-studio`'s
 * `FsRepository` (which has its own `RefEscapesRootError`/
 * `ArtifactValidationError` types) or `@workspec/decision-studio`'s
 * equivalent, `@workspec/c4-model`'s `createFsSource` throws only raw Node
 * filesystem errors (`ENOENT` etc., see its own doc comment) — already
 * handled generically by `mapErrorToResult` — so this package has no
 * repo-specific error type left to classify. Every `c4` tool still routes
 * every catch through this function (rather than hand-rolling its own
 * error text) so the no-leak/logging guarantee stays shared with every
 * other `*-studio` MCP provider.
 */
export function mapC4ErrorToResult(error: unknown, ref?: string): CallToolResult {
  return mapErrorToResult(error, {
    // Only include `ref` when defined: `MapErrorToResultOptions.ref` is
    // plain-optional, and this repo's `exactOptionalPropertyTypes` rejects
    // an explicit `ref: undefined` as distinct from the key being absent.
    ...(ref !== undefined ? { ref } : {}),
    logPrefix: 'c4 mcp',
  });
}
