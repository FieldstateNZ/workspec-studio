import { buildTagPlanJsonSchema, TagPlanArtifact } from '@workspec/cost-schema';
import type { McpToolDef } from '@workspec/mcp-core';
import { readObjectArg, readRefArg, validateThenWrite } from '@workspec/mcp-core';
import type { FsRepository } from '../fs-repository.js';
import { mapRepoErrorToResult } from './map-repo-error-to-result.js';

/**
 * The generated JSON Schema for a `TagPlan` artifact — reused verbatim from
 * `@workspec/cost-schema`'s `buildTagPlanJsonSchema()` (built once at module
 * load, not per call).
 */
const TAGPLAN_JSON_SCHEMA = buildTagPlanJsonSchema();

const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    ref: {
      type: 'string',
      description: 'Repo-relative POSIX path to write the tag-plan artifact to.',
    },
    tagPlan: TAGPLAN_JSON_SCHEMA,
  },
  required: ['ref', 'tagPlan'],
  additionalProperties: false,
};

/** Builds the `write_tagplan` tool: schema-validate then persist, never writing an invalid artifact. */
export function buildWriteTagPlanTool(repo: FsRepository): McpToolDef {
  return {
    name: 'write_tagplan',
    description:
      'Schema-validate and persist a tag-plan artifact at ref. Rejects (without writing) on any validation issue.',
    inputSchema: INPUT_SCHEMA,
    handler: async (args) => {
      let ref: string | undefined;
      try {
        ref = readRefArg(args, 'ref');
        const candidate = readObjectArg(args, 'tagPlan');
        const parsed = TagPlanArtifact.safeParse(candidate);
        return await validateThenWrite(
          parsed,
          ref,
          (r, data) => repo.writeTagPlan(r, data),
          'tag plan',
          mapRepoErrorToResult,
        );
      } catch (error) {
        return mapRepoErrorToResult(error, ref);
      }
    },
  };
}
