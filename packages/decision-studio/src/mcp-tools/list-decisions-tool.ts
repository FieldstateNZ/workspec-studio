import type { McpToolDef } from '@workspec/mcp-core';
import type { FsRepository } from '../fs-repository.js';
import { mapRepoErrorToResult } from './map-repo-error-to-result.js';

const INPUT_SCHEMA = { type: 'object', properties: {}, additionalProperties: false };

/** Builds the `list_decisions` tool for `.workspec/decisions/*.yaml`. */
export function buildListDecisionsTool(repo: FsRepository): McpToolDef {
  return {
    name: 'list_decisions',
    description: 'List every repository-native Decision record (ref, slug, title).',
    inputSchema: INPUT_SCHEMA,
    handler: async () => {
      // Guard the await for defense-in-depth even though discovery currently
      // treats a missing decisions directory as an empty repository.
      try {
        const decisions = await repo.listDecisions();
        return { content: [{ type: 'text', text: JSON.stringify(decisions) }] };
      } catch (error) {
        return mapRepoErrorToResult(error);
      }
    },
  };
}
