import type { McpToolDef } from '@workspec/mcp-core';
import type { FsRepository } from '../fs-repository.js';
import { mapRepoErrorToResult } from './map-repo-error-to-result.js';

const INPUT_SCHEMA = { type: 'object', properties: {}, additionalProperties: false };

/** Builds the `list_environments` tool: every `.workspec/environments/*.yaml` the repo can see, with ref/slug. */
export function buildListEnvironmentsTool(repo: FsRepository): McpToolDef {
  return {
    name: 'list_environments',
    description: 'List every environment artifact under the served directory (ref, slug).',
    inputSchema: INPUT_SCHEMA,
    handler: async () => {
      try {
        const environments = await repo.listEnvironments();
        return { content: [{ type: 'text', text: JSON.stringify(environments) }] };
      } catch (error) {
        return mapRepoErrorToResult(error);
      }
    },
  };
}
