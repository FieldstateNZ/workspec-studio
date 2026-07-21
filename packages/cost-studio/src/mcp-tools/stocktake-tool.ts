import type { CloudProviderPort } from '@workspec/cost-provider';
import type { McpToolDef } from '@workspec/mcp-core';
import type { FsRepository } from '../fs-repository.js';
import { runStocktakeCore } from '../stocktake-core.js';
import { mapRepoErrorToResult } from './map-repo-error-to-result.js';
import { readOptionalStringArg } from './read-optional-string-arg.js';
import { readOptionalStringArrayArg } from './read-optional-string-array-arg.js';

const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    subscription: {
      type: 'array',
      items: { type: 'string' },
      description: 'Subscriptions to include (at least one required).',
    },
    name: {
      type: 'string',
      description: 'Stable inventory/spend slug (default: "estate").',
    },
    period: {
      type: 'string',
      description: 'Billing period "YYYY-MM" (default: the current month).',
    },
  },
  required: ['subscription'],
  additionalProperties: false,
};

/**
 * Builds the `stocktake` tool: the same estate + spend stock-take the CLI's
 * `stocktake` command runs (both call `runStocktakeCore`). Takes a
 * `CloudProviderPort` as a constructor dependency (default
 * `createAzureProvider()`, injectable for tests) — this tool never touches a
 * real cloud provider unless the caller wires one in.
 */
export function buildStocktakeTool(repo: FsRepository, provider: CloudProviderPort, clock: () => string): McpToolDef {
  return {
    name: 'stocktake',
    description:
      'Stock-take an estate + its spend from the cloud provider, diffing against any previous inventory at the same stable ref.',
    inputSchema: INPUT_SCHEMA,
    handler: async (args) => {
      let subscriptions: string[];
      let name: string | undefined;
      let period: string | undefined;
      try {
        subscriptions = readOptionalStringArrayArg(args, 'subscription');
        name = readOptionalStringArg(args, 'name');
        period = readOptionalStringArg(args, 'period');
      } catch (error) {
        return mapRepoErrorToResult(error);
      }

      const outcome = await runStocktakeCore(
        {
          subscriptions,
          ...(name !== undefined ? { name } : {}),
          ...(period !== undefined ? { period } : {}),
        },
        { repository: repo, provider, clock },
      );

      switch (outcome.kind) {
        case 'usage-error':
          return { content: [{ type: 'text', text: outcome.message }], isError: true };
        case 'write-error':
          return mapRepoErrorToResult(outcome.error);
        case 'ok':
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  inventoryRef: outcome.inventoryRef,
                  spendRef: outcome.spendRef,
                  previousStatus: outcome.previousStatus,
                  ...(outcome.driftSummary !== undefined ? { driftSummary: outcome.driftSummary } : {}),
                }),
              },
            ],
          };
      }
    },
  };
}
