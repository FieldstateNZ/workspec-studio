import { buildResourceJsonSchema, ResourceArtifact } from '@workspec/topology-schema';
import type { McpToolDef } from '@workspec/mcp-core';
import { readObjectArg, readRefArg, validateThenWrite } from '@workspec/mcp-core';
import type { FsRepository } from '../fs-repository.js';
import { mapRepoErrorToResult } from './map-repo-error-to-result.js';

const RESOURCE_JSON_SCHEMA = buildResourceJsonSchema();

const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    ref: {
      type: 'string',
      description: 'Repo-relative POSIX path to write the resource artifact to.',
    },
    resource: RESOURCE_JSON_SCHEMA,
  },
  required: ['ref', 'resource'],
  additionalProperties: false,
};

/** Builds the `write_resource` tool: schema-validate then persist, never writing an invalid artifact. */
export function buildWriteResourceTool(repo: FsRepository): McpToolDef {
  return {
    name: 'write_resource',
    description:
      'Schema-validate and persist a resource artifact at ref. Rejects (without writing) on any validation issue.',
    inputSchema: INPUT_SCHEMA,
    handler: async (args) => {
      let ref: string | undefined;
      try {
        ref = readRefArg(args, 'ref');
        const candidate = readObjectArg(args, 'resource');
        const parsed = ResourceArtifact.safeParse(candidate);
        return await validateThenWrite(
          parsed,
          ref,
          (r, data) => repo.writeResource(r, data),
          'resource',
          mapRepoErrorToResult,
        );
      } catch (error) {
        return mapRepoErrorToResult(error, ref);
      }
    },
  };
}
