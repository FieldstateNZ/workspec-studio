import { AttributionArtifact, buildAttributionJsonSchema } from '@workspec/cost-schema';
import type { McpToolDef } from '@workspec/mcp-core';
import { readObjectArg, readRefArg, validateThenWrite } from '@workspec/mcp-core';
import type { FsRepository } from '../fs-repository.js';
import { mapRepoErrorToResult } from './map-repo-error-to-result.js';

/**
 * The generated JSON Schema for an `Attribution` artifact — reused verbatim
 * from `@workspec/cost-schema`'s `buildAttributionJsonSchema()` (built once
 * at module load, not per call).
 */
const ATTRIBUTION_JSON_SCHEMA = buildAttributionJsonSchema();

const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    ref: {
      type: 'string',
      description: 'Repo-relative POSIX path to write the attribution artifact to.',
    },
    attribution: ATTRIBUTION_JSON_SCHEMA,
  },
  required: ['ref', 'attribution'],
  additionalProperties: false,
};

/** Builds the `write_attribution` tool: schema-validate then persist, never writing an invalid artifact. */
export function buildWriteAttributionTool(repo: FsRepository): McpToolDef {
  return {
    name: 'write_attribution',
    description:
      'Schema-validate and persist an attribution artifact at ref. Rejects (without writing) on any validation issue.',
    inputSchema: INPUT_SCHEMA,
    handler: async (args) => {
      let ref: string | undefined;
      try {
        ref = readRefArg(args, 'ref');
        const candidate = readObjectArg(args, 'attribution');
        const parsed = AttributionArtifact.safeParse(candidate);
        return await validateThenWrite(
          parsed,
          ref,
          (r, data) => repo.writeAttribution(r, data),
          'attribution',
          mapRepoErrorToResult,
        );
      } catch (error) {
        return mapRepoErrorToResult(error, ref);
      }
    },
  };
}
