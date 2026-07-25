import type { McpToolDef } from '@workspec/mcp-core';
import { readRefArg } from '@workspec/mcp-core';
import type { FsRepository } from '../fs-repository.js';
import { mapRepoErrorToResult } from './map-repo-error-to-result.js';

const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    ref: {
      type: 'string',
      description: 'Repo-relative POSIX path to the environment artifact, e.g. ".workspec/environments/prod.yaml".',
    },
  },
  required: ['ref'],
  additionalProperties: false,
};

/** Builds the `read_environment` tool: read + schema-validate one environment artifact by ref. */
export function buildReadEnvironmentTool(repo: FsRepository): McpToolDef {
  return {
    name: 'read_environment',
    description: 'Read and schema-validate one environment artifact by ref.',
    inputSchema: INPUT_SCHEMA,
    handler: async (args) => {
      let ref: string | undefined;
      try {
        ref = readRefArg(args, 'ref');
        const environment = await repo.readEnvironment(ref);
        return { content: [{ type: 'text', text: JSON.stringify(environment) }] };
      } catch (error) {
        return mapRepoErrorToResult(error, ref);
      }
    },
  };
}
