import { ADAPTERS } from '@workspec/topology-adapters';
import type { AdapterName } from '@workspec/topology-adapters';
import { MAX_SLUG_LENGTH, SLUG_PATTERN } from '@workspec/schema-core';
import type { McpToolDef } from '@workspec/mcp-core';
import { readObjectArg, readSlugArg, readStringArg } from '@workspec/mcp-core';
import { mapRepoErrorToResult } from './map-repo-error-to-result.js';

const ADAPTER_NAMES = Object.keys(ADAPTERS) as AdapterName[];

const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    adapter: { type: 'string', enum: ADAPTER_NAMES, description: 'Which `@workspec/topology-adapters` adapter to run.' },
    env: {
      type: 'string',
      description:
        'Environment slug this import is for. Not consulted by the adapter itself (adapters are environment-agnostic) — carried for symmetry with the CLI `import` command, which writes the result under `.topology-actual/<env>/`.',
      pattern: SLUG_PATTERN.source,
      maxLength: MAX_SLUG_LENGTH,
    },
    input: {
      type: 'object',
      description:
        'The already-parsed vendor JSON (terraform show -json / a compiled ARM template / an Azure Resource Graph result), matching the shape `adapter` expects.',
    },
  },
  required: ['adapter', 'env', 'input'],
  additionalProperties: true,
};

/**
 * Builds the `import` tool: runs one of `@workspec/topology-adapters`'
 * adapters over an already-parsed vendor payload and returns the derived
 * `Resource[]` + diagnostics it produced. Deliberately does NOT write
 * anything to disk — wiring only, mirroring the adapter's own pure-function
 * contract. The CLI's `import` command is the one that persists the result
 * to `.topology-actual/<env>/`; a caller of this tool that wants those
 * written can follow up with `write_resource` per resource, or a future
 * `apply_import` tool.
 */
export function buildImportTool(): McpToolDef {
  return {
    name: 'import',
    description:
      'Run a topology-adapters import (terraform | bicep | azure-resource-graph) over already-parsed vendor JSON. Returns the derived resources + diagnostics; writes nothing.',
    inputSchema: INPUT_SCHEMA,
    handler: async (args) => {
      try {
        const adapterName = readStringArg(args, 'adapter');
        readSlugArg(args, 'env'); // validated for presence/shape; not consulted by the adapter itself.
        const input = readObjectArg(args, 'input');

        if (!ADAPTER_NAMES.includes(adapterName as AdapterName)) {
          return {
            content: [
              { type: 'text', text: `unknown adapter "${adapterName}" — expected one of: ${ADAPTER_NAMES.join(', ')}` },
            ],
            isError: true,
          };
        }

        const adapter = ADAPTERS[adapterName as AdapterName];
        const output = adapter(input);
        return { content: [{ type: 'text', text: JSON.stringify(output) }] };
      } catch (error) {
        return mapRepoErrorToResult(error);
      }
    },
  };
}
