import type { McpToolDef } from '@workspec/mcp-core';
import { readRefArg } from '@workspec/mcp-core';
import type { FsRepository } from '../fs-repository.js';
import { mapRepoErrorToResult } from './map-repo-error-to-result.js';

const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    ref: {
      type: 'string',
      description: 'Repo-relative POSIX path to the inventory artifact, e.g. ".workspec/inventories/estate.yaml".',
    },
  },
  required: ['ref'],
  additionalProperties: false,
};

/** Builds the `read_inventory` tool: read + schema-validate one inventory artifact by ref. */
export function buildReadInventoryTool(repo: FsRepository): McpToolDef {
  return {
    name: 'read_inventory',
    description: 'Read and schema-validate one inventory artifact by ref.',
    inputSchema: INPUT_SCHEMA,
    handler: async (args) => {
      let ref: string | undefined;
      try {
        ref = readRefArg(args, 'ref');
        const inventory = await repo.readInventory(ref);
        return { content: [{ type: 'text', text: JSON.stringify(inventory) }] };
      } catch (error) {
        return mapRepoErrorToResult(error, ref);
      }
    },
  };
}
