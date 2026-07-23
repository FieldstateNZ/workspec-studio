import type { McpToolDef } from '@workspec/mcp-core';
import { collectDiagnostics } from '../collect-diagnostics.js';
import type { FsRepository } from '../fs-repository.js';
import { mapRepoErrorToResult } from './map-repo-error-to-result.js';

const INPUT_SCHEMA = { type: 'object', properties: {}, additionalProperties: false };

/**
 * Builds the `validate` tool: the exact same check the CLI's `validate`
 * command runs (both call {@link collectDiagnostics}) — schema/read errors
 * across all four artifact kinds (fatal), plus attribution-engine warnings
 * (mixed-currency, orphan-spend, etc.) when at least one inventory and one
 * attribution both parse — returned as the diagnostics array rather than
 * formatted text.
 */
export function buildValidateTool(repo: FsRepository): McpToolDef {
  return {
    name: 'validate',
    description:
      'Validate every cost artifact under the served directory. Returns the diagnostics array (schema/read errors, attribution-engine warnings).',
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
        // this tool never leaks the path.
        return mapRepoErrorToResult(error);
      }
    },
  };
}
