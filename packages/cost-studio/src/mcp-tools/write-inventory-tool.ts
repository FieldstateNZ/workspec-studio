import { buildInventoryJsonSchema, InventoryArtifact } from '@workspec/cost-schema';
import type { McpToolDef } from '@workspec/mcp-core';
import { readObjectArg, readRefArg, validateThenWrite } from '@workspec/mcp-core';
import type { FsRepository } from '../fs-repository.js';
import { mapRepoErrorToResult } from './map-repo-error-to-result.js';

/**
 * The generated JSON Schema for an `Inventory` artifact — reused verbatim
 * from `@workspec/cost-schema`'s `buildInventoryJsonSchema()` (built once at
 * module load, not per call) rather than hand-derived, so the tool's
 * advertised shape never drifts from the schema that actually validates it.
 */
const INVENTORY_JSON_SCHEMA = buildInventoryJsonSchema();

const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    ref: {
      type: 'string',
      description: 'Repo-relative POSIX path to write the inventory artifact to.',
    },
    inventory: INVENTORY_JSON_SCHEMA,
  },
  required: ['ref', 'inventory'],
  additionalProperties: false,
};

/** Builds the `write_inventory` tool: schema-validate then persist, never writing an invalid artifact. */
export function buildWriteInventoryTool(repo: FsRepository): McpToolDef {
  return {
    name: 'write_inventory',
    description:
      'Schema-validate and persist an inventory artifact at ref. Rejects (without writing) on any validation issue.',
    inputSchema: INPUT_SCHEMA,
    handler: async (args) => {
      // `readRefArg`/`readObjectArg` throw on a missing or ill-shaped arg;
      // catch them here so a bad ref (e.g. a backslash-traversal shape) is a
      // clean `isError` result, not an uncaught throw — and, critically,
      // never reaches `writeInventory`, so no garbage file is created.
      let ref: string | undefined;
      try {
        ref = readRefArg(args, 'ref');
        const candidate = readObjectArg(args, 'inventory');
        const parsed = InventoryArtifact.safeParse(candidate);
        return await validateThenWrite(
          parsed,
          ref,
          (r, data) => repo.writeInventory(r, data),
          'inventory',
          mapRepoErrorToResult,
        );
      } catch (error) {
        return mapRepoErrorToResult(error, ref);
      }
    },
  };
}
