import { reconcile, summarizeDrift } from '@workspec/topology-recon';
import type { McpToolDef } from '@workspec/mcp-core';
import { readStringArg } from '@workspec/mcp-core';
import { loadDerivedTopology } from '../derived-topology.js';
import { loadAuthoredModel } from '../load-authored-model.js';
import { resolveModelForEnv } from '../resolve-model.js';
import type { FsRepository } from '../fs-repository.js';
import { mapRepoErrorToResult } from './map-repo-error-to-result.js';

const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    env: { type: 'string', description: 'Environment slug to reconcile, e.g. "prod".' },
  },
  required: ['env'],
  additionalProperties: false,
};

/**
 * Builds the `reconcile` tool: resolves the authored topology for `env`,
 * loads that environment's derived resources from
 * `.topology-actual/<env>/` (written by a prior `import`), and runs
 * `@workspec/topology-recon`'s `reconcile()` — THE NORMATIVE CONTRACT (spec
 * §4). Returns `{ drifts, summary }`; an empty `.topology-actual/<env>/`
 * (nothing imported yet) is a legitimate all-phantom result, not an error.
 */
export function buildReconcileTool(repo: FsRepository): McpToolDef {
  return {
    name: 'reconcile',
    description:
      'Reconcile the authored topology for one environment against its derived (imported) state. Returns { drifts, summary }.',
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
        if (resolved === undefined) {
          return { content: [{ type: 'text', text: 'could not resolve the topology' }], isError: true };
        }

        const outcome = await loadDerivedTopology(repo, env);
        if (outcome.kind === 'read-error') {
          return mapRepoErrorToResult(outcome.error, outcome.ref);
        }

        const drifts = reconcile(resolved, outcome.derived, env);
        const summary = summarizeDrift(drifts);
        return { content: [{ type: 'text', text: JSON.stringify({ drifts, summary }) }] };
      } catch (error) {
        return mapRepoErrorToResult(error);
      }
    },
  };
}
