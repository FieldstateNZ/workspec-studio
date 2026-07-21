import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { McpToolDef } from '@workspec/mcp-core';
import { DEFAULT_RUNS_DIR } from '../fs-repository.js';
import type { TraceRepositoryPort } from '../repository.js';
import { isValidThreshold, runVerifyCore } from '../verify-core.js';
import { mapTraceErrorToResult } from './map-trace-error-to-result.js';
import { readOptionalNumberArg } from './read-optional-number-arg.js';
import { readOptionalStringArg } from './read-optional-string-arg.js';

const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    minScenarioCoverage: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description: 'Fail if scenario coverage ratio is below this (default: 0 — no floor).',
    },
    minUserReqCoverage: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description: 'Fail if userReq coverage ratio is below this (default: 0 — no floor).',
    },
    minPassRate: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description: 'Fail if pass-rate ratio is below this (default: 0 — no floor).',
    },
    runsDir: {
      type: 'string',
      description: `Where runs are read from (default: "${DEFAULT_RUNS_DIR}").`,
    },
  },
  additionalProperties: false,
};

function invalidThresholdResult(key: string, value: number): CallToolResult {
  return {
    content: [{ type: 'text', text: `argument "${key}" must be a number in [0, 1], got ${value}` }],
    isError: true,
  };
}

/**
 * Builds the `verify` tool: the same CI gate the CLI's `verify` command runs
 * (both call `runVerifyCore`) — loads `.workspec/`, derives the model's
 * THREE meters (scenario coverage, userReq coverage, pass rate), and fails
 * on any loader validation issue, any error-severity finding, or a meter
 * below its (opt-in, default-0) floor. Returns the CLI's `--json` shape
 * verbatim: `{verdict, reasons, thresholds, scenarioCoverage,
 * userReqCoverage, passRate, latestRun, findings, loadIssues}`.
 *
 * DESIGN DECISION — `verdict: "fail"` is a NORMAL result, not `isError`: an
 * agent driving this as a CI gate check needs to tell "the gate ran and
 * failed" (act on `verdict`/`reasons` in the body) apart from "the tool
 * itself errored" (a thrown exception — bad args, an unreadable file). This
 * mirrors `@workspec/decision-studio`'s `validate` tool, which likewise
 * returns its diagnostics array as a normal result even when it contains
 * fatal-severity entries — `isError` is reserved for the tool failing to
 * run, not for the domain check it ran finding a problem.
 */
export function buildVerifyTool(repo: TraceRepositoryPort): McpToolDef {
  return {
    name: 'verify',
    description:
      'The CI gate: fail on validation errors, dangling refs, or a scenario-coverage / userReq-coverage / pass-rate floor. Returns the full model summary; check the "verdict" field for pass/fail (a fail is a normal, non-error result).',
    inputSchema: INPUT_SCHEMA,
    handler: async (args) => {
      let minScenarioCoverage: number;
      let minUserReqCoverage: number;
      let minPassRate: number;
      let runsDir: string | undefined;
      try {
        const rawScenario = readOptionalNumberArg(args, 'minScenarioCoverage') ?? 0;
        const rawUserReq = readOptionalNumberArg(args, 'minUserReqCoverage') ?? 0;
        const rawPassRate = readOptionalNumberArg(args, 'minPassRate') ?? 0;
        if (!isValidThreshold(rawScenario)) return invalidThresholdResult('minScenarioCoverage', rawScenario);
        if (!isValidThreshold(rawUserReq)) return invalidThresholdResult('minUserReqCoverage', rawUserReq);
        if (!isValidThreshold(rawPassRate)) return invalidThresholdResult('minPassRate', rawPassRate);
        minScenarioCoverage = rawScenario;
        minUserReqCoverage = rawUserReq;
        minPassRate = rawPassRate;
        runsDir = readOptionalStringArg(args, 'runsDir');
      } catch (error) {
        return mapTraceErrorToResult(error);
      }

      try {
        const result = await runVerifyCore(
          {
            minScenarioCoverage,
            minUserReqCoverage,
            minPassRate,
            runsDir: runsDir ?? DEFAULT_RUNS_DIR,
          },
          repo,
        );
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      } catch (error) {
        return mapTraceErrorToResult(error);
      }
    },
  };
}
