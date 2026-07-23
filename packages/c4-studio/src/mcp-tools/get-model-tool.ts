import type { C4FileSource } from '@workspec/c4-model';
import { loadC4Model } from '@workspec/c4-model';
import type { McpToolDef } from '@workspec/mcp-core';
import { modelToWire } from '../model-to-wire.js';
import { mapC4ErrorToResult } from './map-c4-error-to-result.js';

const INPUT_SCHEMA = { type: 'object', properties: {}, additionalProperties: false };

/**
 * Builds the `get_model` tool: the exact same full-tree load `GET
 * /api/model` runs (both call `loadC4Model` then `modelToWire`) — every
 * element, diagram, style spec, and diagnostic under the served
 * `.workspec/` tree, JSON-serialised.
 */
export function buildGetModelTool(source: C4FileSource): McpToolDef {
  return {
    name: 'get_model',
    description:
      'Load the full C4 model (elements, diagrams, style spec, diagnostics) under the served directory.',
    inputSchema: INPUT_SCHEMA,
    handler: async () => {
      try {
        const model = await loadC4Model(source);
        return { content: [{ type: 'text', text: JSON.stringify(modelToWire(model)) }] };
      } catch (error) {
        return mapC4ErrorToResult(error);
      }
    },
  };
}
