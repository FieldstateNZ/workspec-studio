import type { McpToolDef } from '@workspec/mcp-core';
import { collectDiagnostics } from '../collect-diagnostics.js';
import type { FsRepository } from '../fs-repository.js';
import { mapRepoErrorToResult } from './map-repo-error-to-result.js';

const INPUT_SCHEMA = { type: 'object', properties: {}, additionalProperties: false };

/**
 * Builds the `validate` tool: the exact same check the CLI's `validate`
 * command runs (both call {@link collectDiagnostics}) — schema parse-errors,
 * dangling authored SKU-line references (fatal), and dangling lever
 * references (non-fatal warnings) — returned as the diagnostics array rather
 * than formatted text.
 */
export function buildValidateTool(repo: FsRepository): McpToolDef {
  return {
    name: 'validate',
    description:
      'Validate every decision + catalog under the served directory. Returns the diagnostics array (schema errors, dangling references, lever warnings).',
    inputSchema: INPUT_SCHEMA,
    handler: async () => {
      try {
        const diagnostics = await collectDiagnostics(repo);
        return { content: [{ type: 'text', text: JSON.stringify(diagnostics) }] };
      } catch (error) {
        // `collectDiagnostics` reads artifact files directly; an EACCES on an
        // unreadable file, or a TOCTOU delete between discovery and read,
        // throws a raw Node error whose `.message` carries the served root's
        // absolute path. Route it through the same scrubbing the other tools
        // use — generic text to the client, real error only to stderr — so
        // this tool never leaks the path (the invariant `server.ts`'s
        // `sendInternalError` enforces for the REST surface).
        return mapRepoErrorToResult(error);
      }
    },
  };
}
