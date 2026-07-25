import { buildEnvironmentJsonSchema, EnvironmentArtifact } from '@workspec/topology-schema';
import type { McpToolDef } from '@workspec/mcp-core';
import { readObjectArg, readRefArg, validateThenWrite } from '@workspec/mcp-core';
import type { FsRepository } from '../fs-repository.js';
import { mapRepoErrorToResult } from './map-repo-error-to-result.js';

const ENVIRONMENT_JSON_SCHEMA = buildEnvironmentJsonSchema();

const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    ref: {
      type: 'string',
      description: 'Repo-relative POSIX path to write the environment artifact to.',
    },
    environment: ENVIRONMENT_JSON_SCHEMA,
  },
  required: ['ref', 'environment'],
  additionalProperties: false,
};

/** Builds the `write_environment` tool: schema-validate then persist, never writing an invalid artifact. */
export function buildWriteEnvironmentTool(repo: FsRepository): McpToolDef {
  return {
    name: 'write_environment',
    description:
      'Schema-validate and persist an environment artifact at ref. Rejects (without writing) on any validation issue.',
    inputSchema: INPUT_SCHEMA,
    handler: async (args) => {
      let ref: string | undefined;
      try {
        ref = readRefArg(args, 'ref');
        const candidate = readObjectArg(args, 'environment');
        const parsed = EnvironmentArtifact.safeParse(candidate);
        return await validateThenWrite(
          parsed,
          ref,
          (r, data) => repo.writeEnvironment(r, data),
          'environment',
          mapRepoErrorToResult,
        );
      } catch (error) {
        return mapRepoErrorToResult(error, ref);
      }
    },
  };
}
