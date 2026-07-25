import { computeTopologyCost } from '@workspec/topology-cost';
import { MAX_SLUG_LENGTH, SLUG_PATTERN } from '@workspec/schema-core';
import type { McpToolDef } from '@workspec/mcp-core';
import { readSlugArg } from '@workspec/mcp-core';
import { loadAuthoredModel } from '../load-authored-model.js';
import { loadCatalog } from '../load-catalog.js';
import { resolveModelForEnv } from '../resolve-model.js';
import type { FsRepository } from '../fs-repository.js';
import { mapRepoErrorToResult } from './map-repo-error-to-result.js';

const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    env: {
      type: 'string',
      description: 'Environment slug to price, e.g. "prod".',
      pattern: SLUG_PATTERN.source,
      maxLength: MAX_SLUG_LENGTH,
    },
  },
  required: ['env'],
  additionalProperties: false,
};

/**
 * Builds the `cost` tool: resolves the topology for `env`, loads the pricing
 * catalog its `spec.catalog` slug names from `.workspec/catalogs/`, and runs
 * `@workspec/topology-cost`'s `computeTopologyCost()`.
 */
export function buildCostTool(repo: FsRepository): McpToolDef {
  return {
    name: 'cost',
    description: 'Compute cost + c4-container attribution for the resolved topology of one environment.',
    inputSchema: INPUT_SCHEMA,
    handler: async (args) => {
      try {
        const env = readSlugArg(args, 'env');
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
        if (resolved.catalog === null) {
          return {
            content: [{ type: 'text', text: 'this topology declares no spec.catalog — nothing to price against' }],
            isError: true,
          };
        }

        const catalogOutcome = await loadCatalog(repo, resolved.catalog);
        switch (catalogOutcome.kind) {
          case 'not-found':
            return {
              content: [{ type: 'text', text: `catalog not found: ${catalogOutcome.ref}` }],
              isError: true,
            };
          case 'invalid':
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ error: 'invalid catalog', ref: catalogOutcome.ref, issues: catalogOutcome.issues }),
                },
              ],
              isError: true,
            };
          case 'ok':
            break;
        }

        const result = computeTopologyCost(resolved, catalogOutcome.catalog);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      } catch (error) {
        return mapRepoErrorToResult(error);
      }
    },
  };
}
