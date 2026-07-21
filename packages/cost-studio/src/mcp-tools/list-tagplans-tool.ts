import type { McpToolDef } from '@workspec/mcp-core';
import type { FsRepository } from '../fs-repository.js';
import { mapRepoErrorToResult } from './map-repo-error-to-result.js';

const INPUT_SCHEMA = { type: 'object', properties: {}, additionalProperties: false };

/** Builds the `list_tagplans` tool: every `*.tagplan.yaml` the repo can see, with ref/slug/name. */
export function buildListTagPlansTool(repo: FsRepository): McpToolDef {
  return {
    name: 'list_tagplans',
    description: 'List every tag-plan artifact under the served directory (ref, slug, name).',
    inputSchema: INPUT_SCHEMA,
    handler: async () => {
      try {
        const tagPlans = await repo.listTagPlans();
        return { content: [{ type: 'text', text: JSON.stringify(tagPlans) }] };
      } catch (error) {
        return mapRepoErrorToResult(error);
      }
    },
  };
}
