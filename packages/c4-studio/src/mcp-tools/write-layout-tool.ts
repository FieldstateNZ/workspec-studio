import type { C4FileSource } from '@workspec/c4-model';
import { isLayoutFile, parseLayoutYaml, serializeLayout } from '@workspec/c4-schema';
import type { McpToolDef } from '@workspec/mcp-core';
import { InvalidRefError, readStringArg } from '@workspec/mcp-core';
import { isWorkspecPath } from '../workspec-path.js';
import { mapC4ErrorToResult } from './map-c4-error-to-result.js';

const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    path: {
      type: 'string',
      description:
        'Repo-relative path under .workspec/diagrams/.layout/ to write, e.g. ".workspec/diagrams/.layout/system-context.yaml".',
    },
    content: {
      type: 'string',
      description: 'Layout YAML text, validated via parseLayoutYaml before it is written.',
    },
  },
  required: ['path', 'content'],
  additionalProperties: false,
};

/**
 * Builds the `write_layout` tool: the only write path any
 * `@workspec/c4-ui` component ever exercises (drag-to-pin), mirroring
 * `server.ts`'s `PUT /api/file` handler exactly — the same restriction to
 * `.layout/` files, the same `parseLayoutYaml` → `serializeLayout`
 * validate-then-write flow. Rejects (without writing) in the same order
 * `server.ts` checks: an ill-shaped or `.workspec/`-escaping path, a
 * non-`.layout/` path, then a layout YAML that fails `parseLayoutYaml`.
 */
export function buildWriteLayoutTool(source: C4FileSource): McpToolDef {
  return {
    name: 'write_layout',
    description:
      'Schema-validate and persist a .workspec/diagrams/.layout/ YAML file. Rejects (without writing) on any validation issue.',
    inputSchema: INPUT_SCHEMA,
    handler: async (args) => {
      let path: string | undefined;
      try {
        path = readStringArg(args, 'path');
        // Shape (`isSafeRelativeRef`) + `.workspec/`-confinement in one
        // predicate — the same guard `server.ts`'s `pathParam` uses.
        // Throwing `@workspec/mcp-core`'s own `InvalidRefError` (rather
        // than a bespoke isError text) keeps this failure classified
        // identically to every other `*-studio` write tool's ill-shaped-ref
        // case, via the shared `mapErrorToResult`.
        if (!isWorkspecPath(path)) {
          throw new InvalidRefError('path');
        }
        // Least privilege: the only write path any @workspec/c4-ui
        // component ever exercises is the drag-to-pin `.layout/` write —
        // refuse everything else, mirroring server.ts's own PUT handler.
        if (!isLayoutFile(path)) {
          return {
            content: [{ type: 'text', text: 'writes are only permitted for .layout/ files' }],
            isError: true,
          };
        }

        const content = readStringArg(args, 'content');
        const parsed = parseLayoutYaml(content);
        if (!parsed.ok) {
          return {
            content: [
              { type: 'text', text: JSON.stringify({ error: 'invalid layout', issues: parsed.errors }) },
            ],
            isError: true,
          };
        }

        await source.writeFile(path, serializeLayout(parsed.data));
        return { content: [{ type: 'text', text: `wrote layout "${path}"` }] };
      } catch (error) {
        return mapC4ErrorToResult(error, path);
      }
    },
  };
}
