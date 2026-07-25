import { buildTopologyJsonSchema, TopologyArtifact } from '@workspec/topology-schema';
import type { McpToolDef } from '@workspec/mcp-core';
import { readObjectArg, readRefArg, validateThenWrite } from '@workspec/mcp-core';
import type { FsRepository } from '../fs-repository.js';
import { mapRepoErrorToResult } from './map-repo-error-to-result.js';

/**
 * The generated JSON Schema for a `Topology` artifact — reused verbatim from
 * `@workspec/topology-schema`'s `buildTopologyJsonSchema()` (built once at
 * module load, not per call) so the tool's advertised shape never drifts
 * from the schema that actually validates it.
 */
const TOPOLOGY_JSON_SCHEMA = buildTopologyJsonSchema();

const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    ref: {
      type: 'string',
      description: 'Repo-relative POSIX path to write the topology artifact to.',
    },
    topology: TOPOLOGY_JSON_SCHEMA,
  },
  required: ['ref', 'topology'],
  additionalProperties: false,
};

/** Builds the `write_topology` tool: schema-validate then persist, never writing an invalid artifact. */
export function buildWriteTopologyTool(repo: FsRepository): McpToolDef {
  return {
    name: 'write_topology',
    description:
      'Schema-validate and persist a topology artifact at ref. Rejects (without writing) on any validation issue.',
    inputSchema: INPUT_SCHEMA,
    handler: async (args) => {
      // `readRefArg`/`readObjectArg` throw on a missing or ill-shaped arg;
      // catch them here so a bad ref (e.g. a backslash-traversal shape) is a
      // clean `isError` result, not an uncaught throw — and, critically,
      // never reaches `writeTopology`, so no garbage file is created.
      let ref: string | undefined;
      try {
        ref = readRefArg(args, 'ref');
        const candidate = readObjectArg(args, 'topology');
        const parsed = TopologyArtifact.safeParse(candidate);
        return await validateThenWrite(
          parsed,
          ref,
          (r, data) => repo.writeTopology(r, data),
          'topology',
          mapRepoErrorToResult,
        );
      } catch (error) {
        return mapRepoErrorToResult(error, ref);
      }
    },
  };
}
