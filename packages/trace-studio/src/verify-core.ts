// The `verify` domain core — shared by the CLI's `verify` command (`cli.ts`'s
// `runVerify`, which parses `--min-*` flags/`--dir` and renders the result as
// text or `--json`) and the `trace_verify` MCP tool
// (`mcp-tools/verify-tool.ts`, which reads its args directly and returns the
// SAME result as JSON). This module owns the CI gate itself: loading the
// tree + runs, deriving the model, and evaluating the three-meter +
// error-finding gate (spec §4.7/§5/§9.4 — v0 uses ABSOLUTE thresholds).
// Neither surface re-implements any of it.

import { buildModel } from '@workspec/trace-model';
import type { Finding, Meter, RunRef, TraceModel } from '@workspec/trace-model';
import type { LoadIssue, TraceRepositoryPort } from './repository.js';

/** Render a `0..1` ratio as a fixed-one-decimal percentage, e.g. `"45.0%"`. */
export function pct(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

/** Whether `value` is a valid `0..1` threshold ratio — shared by the CLI's string-flag parsing and the MCP tool's numeric-arg check. */
export function isValidThreshold(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

/** Already-validated `0..1` thresholds a caller has parsed from its own arg surface. */
export interface VerifyParams {
  readonly minScenarioCoverage: number;
  readonly minUserReqCoverage: number;
  readonly minPassRate: number;
  /** Where runs are read from (repo-relative, e.g. `.workspec/.runs`). */
  readonly runsDir: string;
}

/** The gate's own verdict + the reasons it failed (spec §9.4). */
export interface VerifyGate {
  readonly verdict: 'pass' | 'fail';
  readonly reasons: readonly string[];
}

/**
 * Evaluate the gate: any loader validation issue, or any error-severity
 * finding (dangling ref / duplicate slug), ALWAYS fails; the three meter
 * floors are opt-in (default 0 — no floor).
 */
export function evaluateGate(
  model: TraceModel,
  loadIssues: readonly LoadIssue[],
  minScenarioCoverage: number,
  minUserReqCoverage: number,
  minPassRate: number,
): VerifyGate {
  const reasons: string[] = [];
  if (loadIssues.length > 0) {
    reasons.push(`${loadIssues.length} loader validation issue(s)`);
  }
  const errorFindings = model.findings.filter((f) => f.severity === 'error');
  if (errorFindings.length > 0) {
    reasons.push(`${errorFindings.length} error finding(s)`);
  }
  if (model.scenarioCoverage.ratio < minScenarioCoverage) {
    reasons.push(
      `scenario coverage ${pct(model.scenarioCoverage.ratio)} below floor ${pct(minScenarioCoverage)}`,
    );
  }
  if (model.userReqCoverage.ratio < minUserReqCoverage) {
    reasons.push(
      `userReq coverage ${pct(model.userReqCoverage.ratio)} below floor ${pct(minUserReqCoverage)}`,
    );
  }
  if (model.passRate.ratio < minPassRate) {
    reasons.push(`pass-rate ${pct(model.passRate.ratio)} below floor ${pct(minPassRate)}`);
  }
  return { verdict: reasons.length > 0 ? 'fail' : 'pass', reasons };
}

/**
 * The full verify result — the CI gate's outcome plus every meter/finding a
 * caller needs to render it, whether as the CLI's human text/`--json` or the
 * `trace_verify` MCP tool's JSON body. Unlike `emit`/`ingest`, `verify` never
 * writes and never rejects on bad input (its numeric params are pre-
 * validated by the caller) — so this is the only outcome shape, not a
 * discriminated union.
 */
export interface VerifyResult {
  readonly verdict: 'pass' | 'fail';
  readonly reasons: readonly string[];
  readonly thresholds: {
    readonly minScenarioCoverage: number;
    readonly minUserReqCoverage: number;
    readonly minPassRate: number;
  };
  readonly scenarioCoverage: Meter;
  readonly userReqCoverage: Meter;
  readonly passRate: Meter;
  readonly latestRun: RunRef | null;
  readonly findings: readonly Finding[];
  readonly loadIssues: readonly LoadIssue[];
}

/**
 * Runs the CI gate: loads the tree + runs, derives the model, and evaluates
 * the three-meter + error-finding gate against `params`'s already-validated
 * `0..1` thresholds.
 */
export async function runVerifyCore(
  params: VerifyParams,
  repository: TraceRepositoryPort,
): Promise<VerifyResult> {
  const loadedTree = await repository.loadTree();
  const loadedRuns = await repository.loadRuns(params.runsDir);
  const loadIssues: LoadIssue[] = [...loadedTree.issues, ...loadedRuns.issues];

  const model = buildModel(loadedTree.tree, loadedRuns.runs);
  const gate = evaluateGate(
    model,
    loadIssues,
    params.minScenarioCoverage,
    params.minUserReqCoverage,
    params.minPassRate,
  );

  return {
    verdict: gate.verdict,
    reasons: gate.reasons,
    thresholds: {
      minScenarioCoverage: params.minScenarioCoverage,
      minUserReqCoverage: params.minUserReqCoverage,
      minPassRate: params.minPassRate,
    },
    scenarioCoverage: model.scenarioCoverage,
    userReqCoverage: model.userReqCoverage,
    passRate: model.passRate,
    latestRun: model.latestRun,
    findings: model.findings,
    loadIssues,
  };
}
