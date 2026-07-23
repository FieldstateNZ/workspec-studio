import type { McpToolDef } from '@workspec/mcp-core';
import type { FsRepository } from '../fs-repository.js';
import { mapRepoErrorToResult } from './map-repo-error-to-result.js';

const INPUT_SCHEMA = { type: 'object', properties: {}, additionalProperties: false };

/** Builds the `list_catalogs` tool: every `*.catalog.yaml` the repo can see, with ref/id/title. */
export function buildListCatalogsTool(repo: FsRepository): McpToolDef {
  return {
    name: 'list_catalogs',
    description: 'List every *.catalog.yaml artifact under the served directory (ref, id, title).',
    inputSchema: INPUT_SCHEMA,
    handler: async () => {
      // `listCatalogs` currently swallows fs errors internally, but guard the
      // await anyway — defense-in-depth, so a future change there can't leak
      // a raw error (and its absolute paths) to the client.
      try {
        const catalogs = await repo.listCatalogs();
        return { content: [{ type: 'text', text: JSON.stringify(catalogs) }] };
      } catch (error) {
        return mapRepoErrorToResult(error);
      }
    },
  };
}
