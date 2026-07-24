import type { McpToolDef } from '@workspec/mcp-core';
import { readRefArg } from '@workspec/mcp-core';
import type { FsRepository } from '../fs-repository.js';
import { mapRepoErrorToResult } from './map-repo-error-to-result.js';

const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    ref: {
      type: 'string',
      description: 'Repo-relative POSIX path to the resource artifact, e.g. ".workspec/resources/app-service.yaml".',
    },
  },
  required: ['ref'],
  additionalProperties: false,
};

/** Builds the `read_resource` tool: read + schema-validate one resource artifact by ref. */
export function buildReadResourceTool(repo: FsRepository): McpToolDef {
  return {
    name: 'read_resource',
    description: 'Read and schema-validate one resource artifact by ref.',
    inputSchema: INPUT_SCHEMA,
    handler: async (args) => {
      let ref: string | undefined;
      try {
        ref = readRefArg(args, 'ref');
        const resource = await repo.readResource(ref);
        return { content: [{ type: 'text', text: JSON.stringify(resource) }] };
      } catch (error) {
        return mapRepoErrorToResult(error, ref);
      }
    },
  };
}
