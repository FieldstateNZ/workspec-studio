import type { McpToolDef } from '@workspec/mcp-core';
import type { FsRepository } from '../fs-repository.js';
import { mapRepoErrorToResult } from './map-repo-error-to-result.js';

const INPUT_SCHEMA = { type: 'object', properties: {}, additionalProperties: false };

/** Builds the `list_topologies` tool: every `.workspec/topologies/*.yaml` the repo can see, with ref/slug/title. */
export function buildListTopologiesTool(repo: FsRepository): McpToolDef {
  return {
    name: 'list_topologies',
    description: 'List every topology artifact under the served directory (ref, slug, title).',
    inputSchema: INPUT_SCHEMA,
    handler: async () => {
      try {
        const topologies = await repo.listTopologies();
        return { content: [{ type: 'text', text: JSON.stringify(topologies) }] };
      } catch (error) {
        return mapRepoErrorToResult(error);
      }
    },
  };
}
