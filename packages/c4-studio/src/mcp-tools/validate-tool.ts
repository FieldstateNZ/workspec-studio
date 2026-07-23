import type { C4FileSource } from '@workspec/c4-model';
import { loadC4Model } from '@workspec/c4-model';
import type { McpToolDef } from '@workspec/mcp-core';
import { mapC4ErrorToResult } from './map-c4-error-to-result.js';

const INPUT_SCHEMA = { type: 'object', properties: {}, additionalProperties: false };

/**
 * Builds the `validate` tool: the same check the CLI's `validate` command
 * runs (both call `loadC4Model` and read `.diagnostics`) — schema/read
 * errors and warnings across every element/diagram/layout under the served
 * directory. Unlike the CLI, this has no `--strict` flag: `--strict` only
 * changes the CLI's process exit code (fail the run on warnings too, not
 * only errors) — a distinction that has no meaning for an MCP result. A
 * client gets the full diagnostics array either way and can apply its own
 * severity threshold.
 */
export function buildValidateTool(source: C4FileSource): McpToolDef {
  return {
    name: 'validate',
    description:
      'Validate every element/diagram/layout under the served directory. Returns the diagnostics array.',
    inputSchema: INPUT_SCHEMA,
    handler: async () => {
      try {
        const model = await loadC4Model(source);
        return { content: [{ type: 'text', text: JSON.stringify(model.diagnostics) }] };
      } catch (error) {
        return mapC4ErrorToResult(error);
      }
    },
  };
}
