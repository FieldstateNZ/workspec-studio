import type { McpToolDef } from '@workspec/mcp-core';
import type { FsRepository } from '../fs-repository.js';
import { mapRepoErrorToResult } from './map-repo-error-to-result.js';

const INPUT_SCHEMA = { type: 'object', properties: {}, additionalProperties: false };

/** Builds the `list_attributions` tool: every `*.attribution.yaml` the repo can see, with ref/slug/name. */
export function buildListAttributionsTool(repo: FsRepository): McpToolDef {
  return {
    name: 'list_attributions',
    description: 'List every attribution artifact under the served directory (ref, slug, name).',
    inputSchema: INPUT_SCHEMA,
    handler: async () => {
      try {
        const attributions = await repo.listAttributions();
        return { content: [{ type: 'text', text: JSON.stringify(attributions) }] };
      } catch (error) {
        return mapRepoErrorToResult(error);
      }
    },
  };
}
