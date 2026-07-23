import type { McpToolDef } from '@workspec/mcp-core';
import type { FsRepository } from '../fs-repository.js';
import { computePlan } from '../plan-core.js';
import { mapRepoErrorToResult } from './map-repo-error-to-result.js';
import { readOptionalStringArg } from './read-optional-string-arg.js';
import { readOptionalStringArrayArg } from './read-optional-string-array-arg.js';

const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    map: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Per-dimension tag overrides, each "dimensionId=tagName" (repeatable; default: "fs-<kebab-case dimension id>" for every dimension).',
    },
    out: {
      type: 'string',
      description:
        'Repo-relative ref to write the plan to (default: ".workspec/tagplans/<latest period>.yaml").',
    },
  },
  additionalProperties: false,
};

/**
 * Builds the `plan` tool: the same tag-plan computation the CLI's `plan`
 * command runs (both call `computePlan`) — requires exactly one inventory
 * and one attribution in scope, then writes the computed plan. Validation
 * happens inside `computePlan` (via `FsRepository.writeTagPlan`, which
 * itself schema-validates before writing) — `buildTagPlan`'s output is
 * engine-computed, not caller-supplied, so there is no raw candidate here for
 * `validateThenWrite`'s validate-then-write flow to gate.
 */
export function buildPlanTool(repo: FsRepository): McpToolDef {
  return {
    name: 'plan',
    description:
      'Compute (and write) the tag plan needed to converge the estate on its attribution. Requires exactly one inventory and one attribution in scope.',
    inputSchema: INPUT_SCHEMA,
    handler: async (args) => {
      let map: string[];
      let out: string | undefined;
      try {
        map = readOptionalStringArrayArg(args, 'map');
        out = readOptionalStringArg(args, 'out');
      } catch (error) {
        return mapRepoErrorToResult(error);
      }

      const outcome = await computePlan(repo, {
        ...(map.length > 0 ? { map } : {}),
        ...(out !== undefined ? { out } : {}),
      });

      switch (outcome.kind) {
        case 'usage-error':
          return { content: [{ type: 'text', text: outcome.message }], isError: true };
        case 'read-error':
          return mapRepoErrorToResult(outcome.error, outcome.ref);
        case 'internal-error':
          return { content: [{ type: 'text', text: outcome.message }], isError: true };
        case 'nothing-attributable':
          return { content: [{ type: 'text', text: outcome.message }], isError: true };
        case 'write-error':
          return mapRepoErrorToResult(outcome.error);
        case 'ok':
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ outRef: outcome.outRef, counts: outcome.counts }),
              },
            ],
          };
      }
    },
  };
}
