import type { CloudProviderPort } from '@workspec/cost-provider';
import type { McpToolDef } from '@workspec/mcp-core';
import { readRefArg } from '@workspec/mcp-core';
import { computeApply } from '../apply-core.js';
import type { FsRepository } from '../fs-repository.js';
import { mapRepoErrorToResult } from './map-repo-error-to-result.js';
import { readOptionalBooleanArg } from './read-optional-boolean-arg.js';

const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    plan: {
      type: 'string',
      description: 'Repo-relative ref of the tag plan to apply.',
    },
    dryRun: {
      type: 'boolean',
      description: 'Simulate only — no live resource is mutated (default: false).',
    },
  },
  required: ['plan'],
  additionalProperties: false,
};

/**
 * Builds the `apply` tool: the same apply-or-dry-run the CLI's `apply`
 * command runs (both call `computeApply`) — refuses (no writes) when the
 * plan's baseline inventory can't be uniquely found, or when the provider's
 * live state has drifted since the plan was computed. Takes a
 * `CloudProviderPort` as a constructor dependency (default
 * `createAzureProvider()`, injectable for tests) — this tool never touches a
 * real cloud provider unless the caller wires one in.
 */
export function buildApplyTool(repo: FsRepository, provider: CloudProviderPort): McpToolDef {
  return {
    name: 'apply',
    description: 'Apply (or dry-run) a tag plan against the live provider, after verifying no drift since it was computed.',
    inputSchema: INPUT_SCHEMA,
    handler: async (args) => {
      let planRef: string | undefined;
      try {
        planRef = readRefArg(args, 'plan');
        const dryRun = readOptionalBooleanArg(args, 'dryRun');

        const outcome = await computeApply({ repository: repo, provider }, { planRef, dryRun });

        switch (outcome.kind) {
          case 'read-error':
            return mapRepoErrorToResult(outcome.error, outcome.ref);
          case 'no-baseline':
            return { content: [{ type: 'text', text: outcome.message }], isError: true };
          case 'multiple-baseline':
            return {
              content: [{ type: 'text', text: JSON.stringify({ error: outcome.message, refs: outcome.refs }) }],
              isError: true,
            };
          case 'drift':
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    error: outcome.message,
                    baselineRef: outcome.baselineRef,
                    drifts: outcome.drifts,
                  }),
                },
              ],
              isError: true,
            };
          case 'ok':
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    dryRun: outcome.dryRun,
                    applied: outcome.result.applied,
                    skippedNoop: outcome.result.skippedNoop,
                    failed: outcome.result.failed,
                    results: outcome.result.results,
                    nameById: outcome.nameById,
                  }),
                },
              ],
            };
        }
      } catch (error) {
        return mapRepoErrorToResult(error, planRef);
      }
    },
  };
}
