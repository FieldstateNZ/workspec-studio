import type { McpToolDef } from '@workspec/mcp-core';
import { readStringArg } from '@workspec/mcp-core';
import { DEFAULT_RUNS_DIR } from '../fs-repository.js';
import type { MatrixFormat } from '../matrix-format.js';
import { runMatrixCore } from '../matrix-core.js';
import type { TraceRepositoryPort } from '../repository.js';
import { mapTraceErrorToResult } from './map-trace-error-to-result.js';
import { readOptionalStringArg } from './read-optional-string-arg.js';

const KNOWN_FORMATS: ReadonlySet<string> = new Set<MatrixFormat>(['md', 'csv', 'html']);

function isMatrixFormat(value: string): value is MatrixFormat {
  return KNOWN_FORMATS.has(value);
}

const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    format: {
      type: 'string',
      enum: ['md', 'csv', 'html'],
      description: 'The RTM export format.',
    },
    runsDir: {
      type: 'string',
      description: `Where runs are read from (default: "${DEFAULT_RUNS_DIR}").`,
    },
  },
  required: ['format'],
  additionalProperties: false,
};

/**
 * Builds the `matrix` tool: the same RTM (requirements traceability matrix,
 * spec §5/§6) projection the CLI's `matrix` command runs (both call
 * `runMatrixCore`). Unlike the CLI — which infers the export format from
 * `--out`'s extension and either writes it or prints to stdout — this tool
 * always returns the rendered artifact directly as its text result: an MCP
 * client has no server-local file path for a `--out`-style option to target,
 * so `format` is a required, explicit argument instead of an inferred one,
 * and there is no write-to-ref option (mirroring how `@workspec/c4-studio`'s
 * `render` tool always returns rendered SVG directly rather than choosing to
 * write it). Loader validation issues (`.workspec/` parse/schema/filename
 * problems, which the CLI warns to stderr) are NOT folded into this result —
 * a dangling ref is already shown as-authored within the matrix itself (spec
 * §4.8), and the CI-facing gate for those diagnostics is `verify`, not
 * `matrix`.
 */
export function buildMatrixTool(repo: TraceRepositoryPort): McpToolDef {
  return {
    name: 'matrix',
    description:
      'Export the RTM (requirements traceability matrix) as md/csv/html. Returns the rendered artifact as text.',
    inputSchema: INPUT_SCHEMA,
    handler: async (args) => {
      let format: string;
      let runsDir: string | undefined;
      try {
        format = readStringArg(args, 'format');
        runsDir = readOptionalStringArg(args, 'runsDir');
      } catch (error) {
        return mapTraceErrorToResult(error);
      }

      if (!isMatrixFormat(format)) {
        return {
          content: [{ type: 'text', text: `unknown format "${format}" (expected md, csv, or html)` }],
          isError: true,
        };
      }

      try {
        const result = await runMatrixCore({ format, runsDir: runsDir ?? DEFAULT_RUNS_DIR }, repo);
        return { content: [{ type: 'text', text: result.content }] };
      } catch (error) {
        return mapTraceErrorToResult(error);
      }
    },
  };
}
