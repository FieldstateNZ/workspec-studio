import type { McpToolDef } from '@workspec/mcp-core';
import { readRefArg } from '@workspec/mcp-core';
import type { FsRepository } from '../fs-repository.js';
import { mapRepoErrorToResult } from './map-repo-error-to-result.js';

const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    ref: {
      type: 'string',
      description: 'Repo-relative POSIX path to the topology artifact, e.g. ".workspec/topologies/web-app.yaml".',
    },
  },
  required: ['ref'],
  additionalProperties: false,
};

/** Builds the `read_topology` tool: read + schema-validate one topology artifact by ref. */
export function buildReadTopologyTool(repo: FsRepository): McpToolDef {
  return {
    name: 'read_topology',
    description: 'Read and schema-validate one topology artifact by ref.',
    inputSchema: INPUT_SCHEMA,
    handler: async (args) => {
      let ref: string | undefined;
      try {
        ref = readRefArg(args, 'ref');
        const topology = await repo.readTopology(ref);
        return { content: [{ type: 'text', text: JSON.stringify(topology) }] };
      } catch (error) {
        return mapRepoErrorToResult(error, ref);
      }
    },
  };
}
