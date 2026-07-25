import type { McpToolDef } from '@workspec/mcp-core';
import type { FsRepository } from '../fs-repository.js';
import { mapRepoErrorToResult } from './map-repo-error-to-result.js';

const INPUT_SCHEMA = { type: 'object', properties: {}, additionalProperties: false };

/** Builds the `list_resources` tool: every `.workspec/resources/*.yaml` the repo can see, with ref/slug/title. */
export function buildListResourcesTool(repo: FsRepository): McpToolDef {
  return {
    name: 'list_resources',
    description: 'List every resource artifact under the served directory (ref, slug, title).',
    inputSchema: INPUT_SCHEMA,
    handler: async () => {
      try {
        const resources = await repo.listResources();
        return { content: [{ type: 'text', text: JSON.stringify(resources) }] };
      } catch (error) {
        return mapRepoErrorToResult(error);
      }
    },
  };
}
