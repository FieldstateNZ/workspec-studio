import type { McpToolDef } from '@workspec/mcp-core';
import type { FsRepository } from '../fs-repository.js';
import { mapRepoErrorToResult } from './map-repo-error-to-result.js';

const INPUT_SCHEMA = { type: 'object', properties: {}, additionalProperties: false };

/** Builds the `list_decisions` tool: every `*.decision.yaml` the repo can see, with ref/id/title. */
export function buildListDecisionsTool(repo: FsRepository): McpToolDef {
  return {
    name: 'list_decisions',
    description: 'List every *.decision.yaml artifact under the served directory (ref, id, title).',
    inputSchema: INPUT_SCHEMA,
    handler: async () => {
      // See `list-catalogs-tool.ts`: guard the await for defense-in-depth even
      // though `listDecisions` swallows fs errors today.
      try {
        const decisions = await repo.listDecisions();
        return { content: [{ type: 'text', text: JSON.stringify(decisions) }] };
      } catch (error) {
        return mapRepoErrorToResult(error);
      }
    },
  };
}
