// Round-trip conformance — THE acceptance bar (issue #71): "an emitter that
// can't round-trip is broken by definition."
//
// The loop: emit a tree's Rules+scenarios → run a MOCK runner over them (the
// emitter's own report format) → ingest the report back to a `TestRun` →
// build the derivation model and assert the SAME scenarios are proven.
// "Proven" is made SEMANTIC via @workspec/trace-model: it is not "ingest
// produced the key I expected" but "the derivation engine reports
// `ScenarioNode.proof === 'pass'` for the scenario" — the same judgement the
// CLI, meters, and UI make. The scenario is the executed unit (spec §4.5), so
// conformance is judged per-scenario, not per-Rule.
//
// The harness is emitter-AGNOSTIC (so a future junit emitter self-tests through
// it): each emitter supplies its own `MockRunner`, which turns the emitted
// rules into that framework's raw report shape.

import { buildModel } from '@workspec/trace-model';
import type { TraceModel, TraceTree } from '@workspec/trace-model';
import type { TestRun } from '@workspec/req-schema';
import { groupScenariosByRule } from './grouping.js';
import type { Emitter, EmittedFile, RuleWithScenarios, RunMeta } from './types.js';

/**
 * A mock test runner: given the Rules (with their scenarios) an emitter
 * emitted, produce the raw report that emitter's `ingest` consumes — as a
 * passing (or, by closing over options, partly failing) run. Emitter-specific
 * by nature (Cucumber JSON vs JUnit XML); `mockCucumberRun` is the cucumber
 * implementation.
 */
export type MockRunner = (rules: readonly RuleWithScenarios[]) => unknown;

/** The full artefacts of one round-trip, for assertions and diagnostics. */
export interface RoundTrip {
  /** The files `emit` produced. */
  emitted: EmittedFile[];
  /** The `TestRun` `ingest` recovered from the mock run. */
  run: TestRun;
  /** The derivation model built from the tree + the ingested run. */
  model: TraceModel;
  /** Distinct tree scenario slugs the model proves (`proof === 'pass'`), sorted. */
  provenSlugs: string[];
  /** Distinct tree scenario slugs the model does NOT prove, sorted. */
  unprovenSlugs: string[];
}

function byString(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Run the full emit → mock-run → ingest → derive loop and report, per tree
 * scenario, whether the model proves it. Pure: no clock, no IO — `meta`
 * carries the run identity/timestamp the emitter is forbidden to invent.
 */
export function roundTrip(
  emitter: Emitter,
  tree: TraceTree,
  runner: MockRunner,
  meta: RunMeta,
): RoundTrip {
  const rules = groupScenariosByRule(tree);
  const emitted = emitter.emit(rules);
  const run = emitter.ingest(runner(rules), meta);
  const model = buildModel(tree, [run]);

  const proven = new Set(
    model.scenarios.filter((node) => node.proof === 'pass').map((node) => node.slug),
  );
  const expected = [...new Set(tree.scenarios.map((located) => located.slug))].sort(byString);

  return {
    emitted,
    run,
    model,
    provenSlugs: expected.filter((slug) => proven.has(slug)),
    unprovenSlugs: expected.filter((slug) => !proven.has(slug)),
  };
}

/**
 * Run {@link roundTrip} and THROW unless every tree scenario is proven — the
 * conformance claim an emitter must satisfy. Returns the {@link RoundTrip} on
 * success (so callers can make further assertions on `emitted`/`run`/`model`).
 * Use `roundTrip` directly for the negative case (a partly failing run, which
 * SHOULD leave slugs unproven).
 */
export function assertRoundTrip(
  emitter: Emitter,
  tree: TraceTree,
  runner: MockRunner,
  meta: RunMeta,
): RoundTrip {
  const result = roundTrip(emitter, tree, runner, meta);
  if (result.unprovenSlugs.length > 0) {
    throw new Error(
      `[${emitter.name}] round-trip conformance FAILED: ${result.unprovenSlugs.length} ` +
        `scenario(s) not proven after emit → run → ingest: ${result.unprovenSlugs.join(', ')}`,
    );
  }
  return result;
}
