// Shared verdict primitives every emitter's `ingest` maps a toolchain's raw
// per-test result onto (spec §4.6), plus the fold rule collapsing several raw
// elements that share ONE scenario slug into a single verdict — a Cucumber
// Scenario Outline's expanded rows, a JUnit testcase repeated once per
// Examples row. Both `cucumber.ts` and `junit.ts` import this so the fold
// precedence never drifts between bindings. This is an internal DRY point
// between providers, not part of the `Emitter` contract itself (`types.ts`)
// and not re-exported from `index.ts`.

/** The three explicit verdicts a `TestRun.results` entry can hold (identical to req-schema's `TestResult`). */
export type Verdict = 'pass' | 'fail' | 'skip';

/**
 * Fold a slug's next raw-element verdict into its running verdict. Precedence:
 * `fail` > `skip` > `pass` — any non-passing row/element makes the slug
 * non-passing overall. Order-independent, so folding a raw report's elements
 * in ANY order produces the same result (deterministic regardless of how a
 * toolchain orders repeated rows).
 */
export function foldVerdict(existing: Verdict | undefined, next: Verdict): Verdict {
  if (existing === undefined) return next;
  if (existing === 'fail' || next === 'fail') return 'fail';
  if (existing === 'skip' || next === 'skip') return 'skip';
  return 'pass';
}
