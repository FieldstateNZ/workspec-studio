import { buildCatalogJsonSchema, CatalogArtifact } from '@workspec/decision-schema';
import type { McpToolDef } from '@workspec/mcp-core';
import type { FsRepository } from '../fs-repository.js';
import { mapRepoErrorToResult } from './map-repo-error-to-result.js';
import { readObjectArg } from './read-object-arg.js';
import { readRefArg } from './read-ref-arg.js';
import { validateThenWrite } from './validate-then-write.js';

/**
 * The generated JSON Schema for a `Catalog` artifact — reused verbatim from
 * `@workspec/decision-schema`'s `buildCatalogJsonSchema()` (built once at
 * module load, not per call) rather than hand-derived, so the tool's
 * advertised shape — and every field's `.describe()` text — never drifts
 * from the schema that actually validates it.
 */
const CATALOG_JSON_SCHEMA = buildCatalogJsonSchema();

const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    ref: {
      type: 'string',
      description: 'Repo-relative POSIX path to write the catalog artifact to.',
    },
    catalog: CATALOG_JSON_SCHEMA,
  },
  required: ['ref', 'catalog'],
  additionalProperties: false,
};

/** Builds the `write_catalog` tool: schema-validate then persist, never writing an invalid artifact. */
export function buildWriteCatalogTool(repo: FsRepository): McpToolDef {
  return {
    name: 'write_catalog',
    description:
      'Schema-validate and persist a catalog artifact at ref. Rejects (without writing) on any validation issue.',
    inputSchema: INPUT_SCHEMA,
    handler: async (args) => {
      // `readRefArg`/`readObjectArg` throw on a missing or ill-shaped arg;
      // catch them here so a bad ref (e.g. a backslash-traversal shape) is a
      // clean `isError` result, not an uncaught throw — and, critically,
      // never reaches `writeCatalog`, so no garbage file is created.
      // `validateThenWrite` itself returns `isError` for schema failures and
      // maps its own write errors, so this catch only ever sees the arg
      // readers' throws.
      let ref: string | undefined;
      try {
        ref = readRefArg(args, 'ref');
        const candidate = readObjectArg(args, 'catalog');
        const parsed = CatalogArtifact.safeParse(candidate);
        return await validateThenWrite(parsed, ref, (r, data) => repo.writeCatalog(r, data), 'catalog');
      } catch (error) {
        return mapRepoErrorToResult(error, ref);
      }
    },
  };
}
