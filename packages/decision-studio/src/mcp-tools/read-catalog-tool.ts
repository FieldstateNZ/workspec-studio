import type { McpToolDef } from '@workspec/mcp-core';
import type { FsRepository } from '../fs-repository.js';
import { mapRepoErrorToResult } from './map-repo-error-to-result.js';
import { readRefArg } from './read-ref-arg.js';

const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    ref: {
      type: 'string',
      description: 'Repo-relative POSIX path to the catalog artifact, e.g. "platform.catalog.yaml".',
    },
  },
  required: ['ref'],
  additionalProperties: false,
};

/** Builds the `read_catalog` tool: read + schema-validate one catalog artifact by ref. */
export function buildReadCatalogTool(repo: FsRepository): McpToolDef {
  return {
    name: 'read_catalog',
    description: 'Read and schema-validate one catalog artifact by ref.',
    inputSchema: INPUT_SCHEMA,
    handler: async (args) => {
      let ref: string | undefined;
      try {
        ref = readRefArg(args, 'ref');
        const catalog = await repo.readCatalog(ref);
        return { content: [{ type: 'text', text: JSON.stringify(catalog) }] };
      } catch (error) {
        return mapRepoErrorToResult(error, ref);
      }
    },
  };
}
