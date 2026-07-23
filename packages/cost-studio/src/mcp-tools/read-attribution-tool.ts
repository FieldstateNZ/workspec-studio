import type { McpToolDef } from '@workspec/mcp-core';
import { readRefArg } from '@workspec/mcp-core';
import type { FsRepository } from '../fs-repository.js';
import { mapRepoErrorToResult } from './map-repo-error-to-result.js';

const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    ref: {
      type: 'string',
      description: 'Repo-relative POSIX path to the attribution artifact, e.g. ".workspec/attributions/prod.yaml".',
    },
  },
  required: ['ref'],
  additionalProperties: false,
};

/** Builds the `read_attribution` tool: read + schema-validate one attribution artifact by ref. */
export function buildReadAttributionTool(repo: FsRepository): McpToolDef {
  return {
    name: 'read_attribution',
    description: 'Read and schema-validate one attribution artifact by ref.',
    inputSchema: INPUT_SCHEMA,
    handler: async (args) => {
      let ref: string | undefined;
      try {
        ref = readRefArg(args, 'ref');
        const attribution = await repo.readAttribution(ref);
        return { content: [{ type: 'text', text: JSON.stringify(attribution) }] };
      } catch (error) {
        return mapRepoErrorToResult(error, ref);
      }
    },
  };
}
