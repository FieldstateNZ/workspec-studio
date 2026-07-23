import type { McpToolDef } from '@workspec/mcp-core';
import { InvalidRefError, isSafeRelativeRef, readStringArg } from '@workspec/mcp-core';
import { DEFAULT_RUNS_DIR } from '../fs-repository.js';
import { EMITTER_NAMES } from '../emit-core.js';
import { runIngestCore } from '../ingest-core.js';
import type { TraceRepositoryPort } from '../repository.js';
import { mapTraceErrorToResult } from './map-trace-error-to-result.js';
import { readOptionalStringArg } from './read-optional-string-arg.js';

const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    content: {
      type: 'string',
      description:
        "The results file's raw text (e.g. a Cucumber JSON report or a JUnit XML report) — an MCP client has no server-local filesystem to point a <results-file> path at, so the text is passed inline.",
    },
    emitter: {
      type: 'string',
      description: `Emitter that produced the results (${EMITTER_NAMES}).`,
    },
    id: { type: 'string', description: 'Run id (default: derived from the run timestamp).' },
    ts: { type: 'string', description: 'ISO-8601 run timestamp (default: now).' },
    sha: { type: 'string', description: 'Commit SHA the run executed against.' },
    ci: { type: 'string', description: 'CI provider label, e.g. "github-actions".' },
    runsDir: {
      type: 'string',
      description: `Where to write the run (default: "${DEFAULT_RUNS_DIR}").`,
    },
  },
  required: ['content', 'emitter'],
  additionalProperties: false,
};

/**
 * Builds the `ingest` tool: the same results-text -> run (evidence) ingest
 * the CLI's `ingest` command runs (both call `runIngestCore`) — except the
 * CLI reads its `<results-file>` positional off disk first, while this tool
 * takes the text directly as `content` (spec: format-agnostic ingest hands
 * `raw` text straight to `--emitter`'s own parse, never touching the report
 * format itself). Returns the run summary as JSON, mirroring the CLI's
 * `--json` shape (`{ref, id, total, pass, fail, skip}`). Rejects — with no
 * write — the same way the CLI does on an unknown emitter, a malformed
 * derived id, or a derived run that fails `TestRun` schema validation.
 */
export function buildIngestTool(repo: TraceRepositoryPort): McpToolDef {
  return {
    name: 'ingest',
    description:
      "Ingest a test toolchain's results text into a run (evidence). Returns {ref, id, total, pass, fail, skip}.",
    inputSchema: INPUT_SCHEMA,
    handler: async (args) => {
      let content: string;
      let emitter: string;
      let id: string | undefined;
      let ts: string | undefined;
      let sha: string | undefined;
      let ci: string | undefined;
      let runsDir: string | undefined;
      try {
        content = readStringArg(args, 'content');
        emitter = readStringArg(args, 'emitter');
        id = readOptionalStringArg(args, 'id');
        ts = readOptionalStringArg(args, 'ts');
        sha = readOptionalStringArg(args, 'sha');
        ci = readOptionalStringArg(args, 'ci');
        runsDir = readOptionalStringArg(args, 'runsDir');
        // `runsDir` becomes a write-target ref (`posix.join(runsDir, "<id>.json")`).
        // The repository's own `resolve()` still backstops any escape, but
        // reject an ill-shaped value (backslash, `..`, drive-letter, NUL) up
        // front — before any write — so it can't create a junk-named dir
        // inside root, matching how every `write_*` tool guards its ref.
        if (runsDir !== undefined && !isSafeRelativeRef(runsDir)) {
          throw new InvalidRefError('runsDir');
        }
      } catch (error) {
        return mapTraceErrorToResult(error);
      }

      const outcome = await runIngestCore(
        {
          text: content,
          emitter,
          ...(id !== undefined ? { id } : {}),
          ...(ts !== undefined ? { ts } : {}),
          ...(sha !== undefined ? { sha } : {}),
          ...(ci !== undefined ? { ci } : {}),
          runsDir: runsDir ?? DEFAULT_RUNS_DIR,
        },
        { repository: repo, clock: () => new Date().toISOString() },
      );

      switch (outcome.kind) {
        case 'usage-error':
          return { content: [{ type: 'text', text: outcome.message }], isError: true };
        case 'write-error':
          return mapTraceErrorToResult(outcome.error, outcome.ref);
        case 'ok':
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  ref: outcome.ref,
                  id: outcome.id,
                  total: outcome.total,
                  pass: outcome.pass,
                  fail: outcome.fail,
                  skip: outcome.skip,
                }),
              },
            ],
          };
      }
    },
  };
}
