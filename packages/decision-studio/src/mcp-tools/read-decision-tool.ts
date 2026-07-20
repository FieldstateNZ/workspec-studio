import type { McpToolDef } from '@workspec/mcp-core';
import type { FsRepository } from '../fs-repository.js';
import { mapRepoErrorToResult } from './map-repo-error-to-result.js';
import { readRefArg } from './read-ref-arg.js';

const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    ref: {
      type: 'string',
      description: 'Repo-relative POSIX path to the decision artifact, e.g. "hosting-platform.decision.yaml".',
    },
  },
  required: ['ref'],
  additionalProperties: false,
};

/** Builds the `read_decision` tool: read + schema-validate one decision artifact by ref. */
export function buildReadDecisionTool(repo: FsRepository): McpToolDef {
  return {
    name: 'read_decision',
    description: 'Read and schema-validate one decision artifact by ref.',
    inputSchema: INPUT_SCHEMA,
    handler: async (args) => {
      let ref: string | undefined;
      try {
        ref = readRefArg(args, 'ref');
        const decision = await repo.readDecision(ref);
        return { content: [{ type: 'text', text: JSON.stringify(decision) }] };
      } catch (error) {
        return mapRepoErrorToResult(error, ref);
      }
    },
  };
}
