// The `emit` domain core — shared by the CLI's `emit` command (`cli.ts`'s
// `runEmit`, which parses flags and prints the outcome) and the `trace_emit`
// MCP tool (`mcp-tools/emit-tool.ts`, which reads its args directly and
// returns the outcome as JSON). This module owns every check and side effect
// between "emitter + params resolved" and "files written": the Rule/scenario
// grouping, the unknown-emitter validation, the orphan-scenario warning (a
// scenario whose parent Rule isn't in the tree), and the repository writes.
// Neither surface re-implements any of it. Mirrors `@workspec/cost-studio`'s
// `stocktake-core.ts` split.

import { posix } from 'node:path';
import { emitters, getEmitter, groupScenariosByRule } from '@workspec/trace-emitters';
import type { LoadIssue, TraceRepositoryPort } from './repository.js';

/** Emitter names this build ships, for a caller's own "unknown emitter" usage-error text. */
export const EMITTER_NAMES = emitters.map((e) => e.name).join(', ');

/** Inputs a caller has already extracted from its own arg surface (CLI flags or MCP tool args). */
export interface EmitParams {
  /** Emitter convention to use — validated against `getEmitter`. */
  readonly emitter: string;
  /** Only emit Rules (system-requirements) whose feature is this slug. */
  readonly feature?: string;
  /** Directory to write test files into (default: `"features"`). */
  readonly out?: string;
}

/** A client-input problem (an unknown `--emitter`/`emitter` arg) — never touches the repository. */
export interface EmitUsageError {
  readonly kind: 'usage-error';
  readonly message: string;
}

/** The emitter ran but a repository write failed (e.g. a race, disk-full, a ref escaping the served root). */
export interface EmitWriteError {
  readonly kind: 'write-error';
  readonly ref: string;
  readonly error: unknown;
  readonly loadIssues: readonly LoadIssue[];
  readonly scenarioWarnings: readonly string[];
}

/** Successful outcome: the emitter's name, the refs written, and every diagnostic collected along the way. */
export interface EmitOk {
  readonly kind: 'ok';
  readonly emitter: string;
  readonly files: readonly string[];
  /** Problems the loader hit reading `.workspec/` (parse/schema/filename issues). */
  readonly loadIssues: readonly LoadIssue[];
  /** One line per scenario whose parent Rule isn't in the tree (checked against ALL rules, not the `--feature` filter). */
  readonly scenarioWarnings: readonly string[];
}

export type EmitOutcome = EmitOk | EmitUsageError | EmitWriteError;

/**
 * Runs `emit`: validates `params.emitter`, loads the tree, groups scenarios
 * under their Rule, runs the emitter, and writes every returned file under
 * `params.out` (default `"features"`). Never throws for an expected failure
 * (usage or write) — every path resolves to an {@link EmitOutcome}.
 */
export async function runEmitCore(
  params: EmitParams,
  repository: TraceRepositoryPort,
): Promise<EmitOutcome> {
  const emitter = getEmitter(params.emitter);
  if (emitter === undefined) {
    return {
      kind: 'usage-error',
      message: `unknown emitter "${params.emitter}" (available: ${EMITTER_NAMES})`,
    };
  }

  const out = params.out ?? 'features';
  const { tree, issues: loadIssues } = await repository.loadTree();

  // A scenario whose parent Rule isn't in the tree can't be emitted (it lands
  // under a group key nothing retrieves) — warn so the author isn't left
  // with a silently incomplete suite. Checked against ALL rules, not the
  // --feature-filtered set. `verify` also flags this as a dangling-ref.
  const ruleSlugs = new Set(tree.systemRequirements.map((s) => s.slug));
  const scenarioWarnings: string[] = [];
  for (const scenario of tree.scenarios) {
    const parent = scenario.artifact.spec.systemRequirement;
    if (!ruleSlugs.has(parent)) {
      scenarioWarnings.push(`scenario "${scenario.slug}" references unknown rule "${parent}" — skipped`);
    }
  }

  const systemRequirements =
    params.feature !== undefined
      ? tree.systemRequirements.filter((s) => s.artifact.spec.feature === params.feature)
      : tree.systemRequirements;

  const rules = groupScenariosByRule({ ...tree, systemRequirements });
  const files = emitter.emit(rules);

  const written: string[] = [];
  for (const file of files) {
    const ref = posix.join(out, file.path);
    try {
      await repository.writeFile(ref, file.content);
    } catch (error) {
      return { kind: 'write-error', ref, error, loadIssues, scenarioWarnings };
    }
    written.push(ref);
  }

  return { kind: 'ok', emitter: emitter.name, files: written, loadIssues, scenarioWarnings };
}
