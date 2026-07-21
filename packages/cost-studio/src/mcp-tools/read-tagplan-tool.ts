import type { McpToolDef } from '@workspec/mcp-core';
import { readRefArg } from '@workspec/mcp-core';
import type { FsRepository } from '../fs-repository.js';
import { mapRepoErrorToResult } from './map-repo-error-to-result.js';

const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    ref: {
      type: 'string',
      description: 'Repo-relative POSIX path to the tag-plan artifact, e.g. ".workspec/tagplans/2026-07.yaml".',
    },
  },
  required: ['ref'],
  additionalProperties: false,
};

/** Builds the `read_tagplan` tool: read + schema-validate one tag-plan artifact by ref. */
export function buildReadTagPlanTool(repo: FsRepository): McpToolDef {
  return {
    name: 'read_tagplan',
    description: 'Read and schema-validate one tag-plan artifact by ref.',
    inputSchema: INPUT_SCHEMA,
    handler: async (args) => {
      let ref: string | undefined;
      try {
        ref = readRefArg(args, 'ref');
        const tagPlan = await repo.readTagPlan(ref);
        return { content: [{ type: 'text', text: JSON.stringify(tagPlan) }] };
      } catch (error) {
        return mapRepoErrorToResult(error, ref);
      }
    },
  };
}
