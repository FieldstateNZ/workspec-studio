import type { McpToolDef } from '@workspec/mcp-core';
import type { FsRepository } from '../fs-repository.js';
import { mapRepoErrorToResult } from './map-repo-error-to-result.js';

const INPUT_SCHEMA = { type: 'object', properties: {}, additionalProperties: false };

/** Builds the `list_spends` tool: every `*.spend.yaml` the repo can see, with ref/slug/name. */
export function buildListSpendsTool(repo: FsRepository): McpToolDef {
  return {
    name: 'list_spends',
    description: 'List every spend artifact under the served directory (ref, slug, name).',
    inputSchema: INPUT_SCHEMA,
    handler: async () => {
      try {
        const spends = await repo.listSpends();
        return { content: [{ type: 'text', text: JSON.stringify(spends) }] };
      } catch (error) {
        return mapRepoErrorToResult(error);
      }
    },
  };
}
