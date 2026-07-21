import type { McpToolDef } from '@workspec/mcp-core';
import { readRefArg } from '@workspec/mcp-core';
import type { FsRepository } from '../fs-repository.js';
import { mapRepoErrorToResult } from './map-repo-error-to-result.js';

const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    ref: {
      type: 'string',
      description: 'Repo-relative POSIX path to the spend artifact, e.g. ".workspec/spends/estate-2026-07.yaml".',
    },
  },
  required: ['ref'],
  additionalProperties: false,
};

/** Builds the `read_spend` tool: read + schema-validate one spend artifact by ref. */
export function buildReadSpendTool(repo: FsRepository): McpToolDef {
  return {
    name: 'read_spend',
    description: 'Read and schema-validate one spend artifact by ref.',
    inputSchema: INPUT_SCHEMA,
    handler: async (args) => {
      let ref: string | undefined;
      try {
        ref = readRefArg(args, 'ref');
        const spend = await repo.readSpend(ref);
        return { content: [{ type: 'text', text: JSON.stringify(spend) }] };
      } catch (error) {
        return mapRepoErrorToResult(error, ref);
      }
    },
  };
}
