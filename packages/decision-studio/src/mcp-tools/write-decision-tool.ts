import { buildDecisionJsonSchema, DecisionArtifact } from '@workspec/decision-schema';
import type { McpToolDef } from '@workspec/mcp-core';
import { readObjectArg, readRefArg, validateThenWrite } from '@workspec/mcp-core';
import type { FsRepository } from '../fs-repository.js';
import { mapRepoErrorToResult } from './map-repo-error-to-result.js';

/**
 * The generated JSON Schema for a `Decision` artifact — see
 * `write-catalog-tool.ts`'s equivalent constant for why this is reused
 * verbatim from `@workspec/decision-schema` rather than hand-derived.
 */
const DECISION_JSON_SCHEMA = buildDecisionJsonSchema();

const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    ref: {
      type: 'string',
      description: 'Repo-relative POSIX path to write the decision artifact to.',
    },
    decision: DECISION_JSON_SCHEMA,
  },
  required: ['ref', 'decision'],
  additionalProperties: false,
};

/** Builds the `write_decision` tool: schema-validate then persist, never writing an invalid artifact. */
export function buildWriteDecisionTool(repo: FsRepository): McpToolDef {
  return {
    name: 'write_decision',
    description:
      'Schema-validate and persist a decision artifact at ref. Rejects (without writing) on any validation issue.',
    inputSchema: INPUT_SCHEMA,
    handler: async (args) => {
      // See `write-catalog-tool.ts`: guard the arg readers so a bad ref is a
      // clean isError and never reaches `writeDecision`.
      let ref: string | undefined;
      try {
        ref = readRefArg(args, 'ref');
        const candidate = readObjectArg(args, 'decision');
        const parsed = DecisionArtifact.safeParse(candidate);
        return await validateThenWrite(
          parsed,
          ref,
          (r, data) => repo.writeDecision(r, data),
          'decision',
          mapRepoErrorToResult,
        );
      } catch (error) {
        return mapRepoErrorToResult(error, ref);
      }
    },
  };
}
