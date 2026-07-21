import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { McpToolDef } from '@workspec/mcp-core';
import type { FsRepository } from '../fs-repository.js';
import { computeReport } from '../report-core.js';
import { renderReport } from '../report-render.js';
import { mapRepoErrorToResult } from './map-repo-error-to-result.js';
import { readOptionalStringArg } from './read-optional-string-arg.js';

const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    by: {
      type: 'string',
      description: 'Dimension to roll up by (default: the attribution\'s primary dimension).',
    },
    format: {
      type: 'string',
      enum: ['table', 'json', 'csv'],
      description: 'Output format (default: "table").',
    },
  },
  additionalProperties: false,
};

/**
 * Builds the `report` tool: the same coverage-headline + rollup-by-dimension
 * computation the CLI's `report` command runs (both call `computeReport`),
 * rendered via the same `renderReport` the CLI uses for table/json/csv.
 * Requires exactly one inventory and one attribution in the served
 * directory; that and an unknown `--by`/`--format` are `isError` results, not
 * throws — a client can retry with corrected arguments.
 */
export function buildReportTool(repo: FsRepository): McpToolDef {
  return {
    name: 'report',
    description:
      'Coverage headline + rollup by dimension. Requires exactly one inventory and one attribution in scope.',
    inputSchema: INPUT_SCHEMA,
    handler: async (args): Promise<CallToolResult> => {
      let by: string | undefined;
      let format: string | undefined;
      try {
        by = readOptionalStringArg(args, 'by');
        format = readOptionalStringArg(args, 'format');
      } catch (error) {
        return mapRepoErrorToResult(error);
      }

      const outcome = await computeReport(repo, { ...(by !== undefined ? { by } : {}) });
      switch (outcome.kind) {
        case 'usage-error':
          return { content: [{ type: 'text', text: outcome.message }], isError: true };
        case 'read-error':
          return mapRepoErrorToResult(outcome.error, outcome.ref);
        case 'internal-error':
          return { content: [{ type: 'text', text: outcome.message }], isError: true };
        case 'ok':
          break;
      }

      const rendered = renderReport(format, {
        dimensionId: outcome.dimensionId,
        dimensionLabel: outcome.dimensionLabel,
        primaryCoverage: outcome.primaryCoverage,
        coverage: outcome.coverage,
        rollup: outcome.rollup,
        totals: outcome.totals,
      });
      if ('usageError' in rendered) {
        return { content: [{ type: 'text', text: rendered.usageError }], isError: true };
      }
      const warningsPrefix = outcome.warnings
        .map((w) => `warning: [${w.code}] ${w.message}`)
        .join('\n');
      const text = warningsPrefix.length > 0 ? `${warningsPrefix}\n${rendered.text}` : rendered.text;
      return { content: [{ type: 'text', text }] };
    },
  };
}
