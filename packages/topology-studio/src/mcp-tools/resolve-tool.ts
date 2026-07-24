import type { McpToolDef } from '@workspec/mcp-core';
import { readStringArg } from '@workspec/mcp-core';
import { loadAuthoredModel } from '../load-authored-model.js';
import { resolveModelForEnv } from '../resolve-model.js';
import type { FsRepository } from '../fs-repository.js';
import { mapRepoErrorToResult } from './map-repo-error-to-result.js';

const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    env: { type: 'string', description: 'Environment slug to resolve the topology for, e.g. "prod".' },
  },
  required: ['env'],
  additionalProperties: false,
};

/**
 * Builds the `resolve` tool: loads the tree's `TopologyModel` and runs
 * `@workspec/topology-model`'s `resolve()` for `env` — the normative,
 * environment-scoped view every other tool (`reconcile`, `cost`) and the UI
 * itself build on.
 */
export function buildResolveTool(repo: FsRepository): McpToolDef {
  return {
    name: 'resolve',
    description: 'Resolve the tree\'s topology for one environment: pruned resources/connections, merged overrides.',
    inputSchema: INPUT_SCHEMA,
    handler: async (args) => {
      try {
        const env = readStringArg(args, 'env');
        const model = await loadAuthoredModel(repo);
        if (model.topology === null) {
          return {
            content: [
              {
                type: 'text',
                text: 'no single topology found (zero, or more than one, .workspec/topologies/*.yaml file)',
              },
            ],
            isError: true,
          };
        }
        const resolved = resolveModelForEnv(model, env);
        return { content: [{ type: 'text', text: JSON.stringify(resolved) }] };
      } catch (error) {
        return mapRepoErrorToResult(error);
      }
    },
  };
}
