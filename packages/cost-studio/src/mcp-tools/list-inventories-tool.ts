import type { McpToolDef } from '@workspec/mcp-core';
import type { FsRepository } from '../fs-repository.js';
import { mapRepoErrorToResult } from './map-repo-error-to-result.js';

const INPUT_SCHEMA = { type: 'object', properties: {}, additionalProperties: false };

/** Builds the `list_inventories` tool: every `*.inventory.yaml` the repo can see, with ref/slug/name. */
export function buildListInventoriesTool(repo: FsRepository): McpToolDef {
  return {
    name: 'list_inventories',
    description: 'List every inventory artifact under the served directory (ref, slug, name).',
    inputSchema: INPUT_SCHEMA,
    handler: async () => {
      try {
        const inventories = await repo.listInventories();
        return { content: [{ type: 'text', text: JSON.stringify(inventories) }] };
      } catch (error) {
        return mapRepoErrorToResult(error);
      }
    },
  };
}
