import type { McpToolDef } from '@workspec/mcp-core';
import { InvalidRefError, isSafeRelativeRef, readStringArg } from '@workspec/mcp-core';
import { EMITTER_NAMES, runEmitCore } from '../emit-core.js';
import { formatLoadIssue } from '../format-load-issue.js';
import type { TraceRepositoryPort } from '../repository.js';
import { mapTraceErrorToResult } from './map-trace-error-to-result.js';
import { readOptionalStringArg } from './read-optional-string-arg.js';

const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    emitter: {
      type: 'string',
      description: `Emitter convention to use (${EMITTER_NAMES}).`,
    },
    feature: {
      type: 'string',
      description: 'Only emit Rules (system-requirements) whose feature is this slug.',
    },
    out: {
      type: 'string',
      description: 'Directory to write test files into (default: "features").',
    },
  },
  required: ['emitter'],
  additionalProperties: false,
};

/**
 * Builds the `emit` tool: the same greenfield Rules+scenarios -> test-files
 * emission the CLI's `emit` command runs (both call `runEmitCore`). Returns
 * the written-file report as JSON, mirroring the CLI's `--json` shape
 * (`{emitter, count, files}`), PLUS a `warnings` array folding in every
 * diagnostic the CLI would otherwise print to stderr (loader validation
 * issues under `.workspec/`, and orphan-scenario "references unknown rule"
 * notices) — an MCP tool result has no separate stderr-shaped channel, so
 * these ride along in the body rather than being silently dropped.
 */
export function buildEmitTool(repo: TraceRepositoryPort): McpToolDef {
  return {
    name: 'emit',
    description:
      'Emit test files from system-requirements (Rules) + scenarios (greenfield). Writes one file per Rule under --out (default "features"). Returns {emitter, count, files, warnings}.',
    inputSchema: INPUT_SCHEMA,
    handler: async (args) => {
      let emitter: string;
      let feature: string | undefined;
      let out: string | undefined;
      try {
        emitter = readStringArg(args, 'emitter');
        feature = readOptionalStringArg(args, 'feature');
        out = readOptionalStringArg(args, 'out');
        // `out` becomes a write-target ref (`posix.join(out, file.path)` per
        // emitted file). The repository's own `resolve()` still backstops any
        // escape, but reject an ill-shaped value (backslash, `..`, drive-
        // letter, NUL) up front — before any write — so it can't create a
        // junk-named dir inside root, matching how every `write_*` tool
        // guards its ref.
        if (out !== undefined && !isSafeRelativeRef(out)) {
          throw new InvalidRefError('out');
        }
      } catch (error) {
        return mapTraceErrorToResult(error);
      }

      const outcome = await runEmitCore(
        {
          emitter,
          ...(feature !== undefined ? { feature } : {}),
          ...(out !== undefined ? { out } : {}),
        },
        repo,
      );

      switch (outcome.kind) {
        case 'usage-error':
          return { content: [{ type: 'text', text: outcome.message }], isError: true };
        case 'write-error':
          return mapTraceErrorToResult(outcome.error, outcome.ref);
        case 'ok': {
          const warnings = [
            ...outcome.loadIssues.map(formatLoadIssue),
            ...outcome.scenarioWarnings,
          ];
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  emitter: outcome.emitter,
                  count: outcome.files.length,
                  files: outcome.files,
                  warnings,
                }),
              },
            ],
          };
        }
      }
    },
  };
}
