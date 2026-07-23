import { z } from 'zod';
import type { C4FileSource } from '@workspec/c4-model';
import type { McpToolDef } from '@workspec/mcp-core';
import { readObjectArg, readStringArg } from '@workspec/mcp-core';
import { checkAspireGraph } from '../aspire/check.js';
import { AspireGraph, parseAspireGraph } from '../aspire/graph-schema.js';
import { scaffoldAspireGraph } from '../aspire/scaffold.js';
import { mapC4ErrorToResult } from './map-c4-error-to-result.js';

/**
 * JSON Schema for the `graph` argument, derived directly from the
 * `AspireGraph` zod schema (the same schema `parseAspireGraph` validates
 * against) via zod's own `toJSONSchema` — deliberately NOT
 * `@workspec/c4-schema`'s `buildJsonSchema`, which stamps the `$id`/`title`
 * of a COMMITTED WorkSpec artifact schema onto its output. `AspireGraph`
 * describes an external producer's contract (a .NET Aspire apphost dump,
 * see `../aspire/graph-schema.ts`'s own doc comment), not a WorkSpec
 * artifact, so it doesn't belong in that registry.
 */
const GRAPH_JSON_SCHEMA = z.toJSONSchema(AspireGraph, { target: 'draft-2020-12', io: 'input' });

const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    graph: GRAPH_JSON_SCHEMA,
    mode: {
      type: 'string',
      enum: ['scaffold', 'check'],
      description:
        '"scaffold" writes the projected tree under .workspec/ (broader than write_layout\'s .layout/-only writes — see this tool\'s own description). "check" reports drift only; it never writes.',
    },
  },
  required: ['graph', 'mode'],
  additionalProperties: false,
};

/**
 * Builds the `import_aspire` tool: projects an already-parsed
 * `workspec-graph/v1` document into the served `.workspec/` tree via the
 * same `scaffoldAspireGraph`/`checkAspireGraph` the CLI's `import-aspire`
 * command uses. Unlike the CLI's `--graph <file>`, the graph arrives as a
 * JSON value in the call args — an MCP client has no access to the
 * server's local filesystem to point at a file path.
 *
 * `mode: "scaffold"` WRITES under `.workspec/` more broadly than
 * `write_layout` (which is confined to `.workspec/diagrams/.layout/`): it
 * can create/update element files across every governed kind directory
 * (`containers/`, `databases/`, `queues/`, `external-systems/`, `system/`)
 * plus the generated `diagrams/aspire-container.yaml`. This mirrors the
 * CLI's own existing `import-aspire --mode scaffold` write surface exactly
 * — it is not a new privilege invented for MCP, but it IS a materially
 * broader write surface than every other tool this provider exposes, worth
 * a reviewer's explicit attention. `mode: "check"` never writes.
 */
export function buildImportAspireTool(source: C4FileSource): McpToolDef {
  return {
    name: 'import_aspire',
    description:
      'Project a workspec-graph/v1 Aspire resource graph into the served .workspec/ tree. mode "scaffold" writes (see this tool\'s own doc comment on write scope); mode "check" reports drift, read-only.',
    inputSchema: INPUT_SCHEMA,
    handler: async (args) => {
      let candidate: unknown;
      let mode: string;
      try {
        candidate = readObjectArg(args, 'graph');
        mode = readStringArg(args, 'mode');
      } catch (error) {
        return mapC4ErrorToResult(error);
      }
      if (mode !== 'scaffold' && mode !== 'check') {
        return {
          content: [
            { type: 'text', text: `argument "mode" must be "scaffold" or "check" (got "${mode}")` },
          ],
          isError: true,
        };
      }

      // `parseAspireGraph` only accepts raw JSON text (its parse-error
      // messages are derived from `JSON.parse` and from re-deriving the
      // version check against the raw document) — there is no
      // already-parsed-object variant. `candidate` is already a parsed
      // object here (an MCP tool call's arguments are JSON-RPC params,
      // never raw text), so this round trip only re-runs the
      // version/schema checks; it can never itself produce a JSON syntax
      // error.
      const parsed = parseAspireGraph(JSON.stringify(candidate));
      if (!parsed.ok) {
        return { content: [{ type: 'text', text: parsed.message }], isError: true };
      }

      try {
        if (mode === 'check') {
          const diagnostics = await checkAspireGraph(source, parsed.data);
          return { content: [{ type: 'text', text: JSON.stringify(diagnostics) }] };
        }
        const report = await scaffoldAspireGraph(source, parsed.data);
        return { content: [{ type: 'text', text: JSON.stringify(report) }] };
      } catch (error) {
        return mapC4ErrorToResult(error);
      }
    },
  };
}
