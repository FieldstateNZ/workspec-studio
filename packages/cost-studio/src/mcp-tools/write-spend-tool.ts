import { buildSpendJsonSchema, SpendArtifact } from '@workspec/cost-schema';
import type { McpToolDef } from '@workspec/mcp-core';
import { readObjectArg, readRefArg, validateThenWrite } from '@workspec/mcp-core';
import type { FsRepository } from '../fs-repository.js';
import { mapRepoErrorToResult } from './map-repo-error-to-result.js';

/**
 * The generated JSON Schema for a `Spend` artifact — reused verbatim from
 * `@workspec/cost-schema`'s `buildSpendJsonSchema()` (built once at module
 * load, not per call).
 */
const SPEND_JSON_SCHEMA = buildSpendJsonSchema();

const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    ref: {
      type: 'string',
      description: 'Repo-relative POSIX path to write the spend artifact to.',
    },
    spend: SPEND_JSON_SCHEMA,
  },
  required: ['ref', 'spend'],
  additionalProperties: false,
};

/** Builds the `write_spend` tool: schema-validate then persist, never writing an invalid artifact. */
export function buildWriteSpendTool(repo: FsRepository): McpToolDef {
  return {
    name: 'write_spend',
    description:
      'Schema-validate and persist a spend artifact at ref. Rejects (without writing) on any validation issue.',
    inputSchema: INPUT_SCHEMA,
    handler: async (args) => {
      let ref: string | undefined;
      try {
        ref = readRefArg(args, 'ref');
        const candidate = readObjectArg(args, 'spend');
        const parsed = SpendArtifact.safeParse(candidate);
        return await validateThenWrite(
          parsed,
          ref,
          (r, data) => repo.writeSpend(r, data),
          'spend',
          mapRepoErrorToResult,
        );
      } catch (error) {
        return mapRepoErrorToResult(error, ref);
      }
    },
  };
}
