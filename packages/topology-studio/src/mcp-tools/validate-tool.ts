import type { McpToolDef } from '@workspec/mcp-core';
import { loadAuthoredModel } from '../load-authored-model.js';
import type { FsRepository } from '../fs-repository.js';
import { mapRepoErrorToResult } from './map-repo-error-to-result.js';

const INPUT_SCHEMA = { type: 'object', properties: {}, additionalProperties: false };

/**
 * Builds the `validate` tool: loads the whole-tree `TopologyModel`
 * (`@workspec/topology-model`'s `loadTopologyModel`, the same call the CLI's
 * `validate` command makes) and returns its `diagnostics` array — parse/
 * schema errors, the no-topology/multiple-topologies file-count checks, and
 * every dangling cross-reference. `loadTopologyModel` never throws (see its
 * own doc comment), so the only way this tool reports `isError` is an
 * unexpected filesystem fault while reading the tree (an EACCES, a TOCTOU
 * delete mid-scan) — routed through the same no-leak scrubbing every other
 * tool uses.
 */
export function buildValidateTool(repo: FsRepository): McpToolDef {
  return {
    name: 'validate',
    description:
      'Validate the whole topology tree under the served directory. Returns the diagnostics array (schema/read errors, dangling references, topology-count checks).',
    inputSchema: INPUT_SCHEMA,
    handler: async () => {
      try {
        const model = await loadAuthoredModel(repo);
        return { content: [{ type: 'text', text: JSON.stringify(model.diagnostics) }] };
      } catch (error) {
        return mapRepoErrorToResult(error);
      }
    },
  };
}
