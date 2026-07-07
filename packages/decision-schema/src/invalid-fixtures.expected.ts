// Manifest for the invalid-fixture battery in `test/fixtures/invalid/`.
//
// Each entry names a fixture that MUST fail validation, the artifact kind it
// should be parsed as, and the expected first-issue `path` + source `line`. The
// fixtures/tests together prove that (a) each distinct failure mode is rejected
// and (b) the Zod-issue-path → YAML-line mapping is correct.

export interface InvalidCase {
  /** Filename under `test/fixtures/invalid/`. */
  file: string;
  /** Which parser to run. */
  kind: 'decision' | 'catalog';
  /** What is wrong (documentation only). */
  reason: string;
  /** Expected dotted path of the (first) reported issue. */
  path: string;
  /** Expected 1-based YAML line of that issue. */
  line: number;
}

export const invalidCases: readonly InvalidCase[] = [
  {
    file: 'bad-status.decision.yaml',
    kind: 'decision',
    reason: 'status is not one of the allowed enum values',
    path: 'metadata.status',
    line: 7,
  },
  {
    file: 'missing-context.decision.yaml',
    kind: 'decision',
    reason: 'required spec.context is absent',
    path: 'spec.context',
    line: 9,
  },
  {
    file: 'unknown-discriminator.decision.yaml',
    kind: 'decision',
    reason: 'line `flat` discriminator is neither true nor false',
    path: 'spec.options.0.lines.0.flat',
    line: 24,
  },
  {
    file: 'negative-weight.decision.yaml',
    kind: 'decision',
    reason: 'criterion weight is negative',
    path: 'spec.criteria.0.weight',
    line: 16,
  },
  {
    file: 'wrong-type-amount.decision.yaml',
    kind: 'decision',
    reason: 'a flat amount value is a string, not a number',
    path: 'spec.options.0.lines.0.amount.prod',
    line: 25,
  },
  {
    file: 'dangling-env-key.decision.yaml',
    kind: 'decision',
    reason: 'a per-env amount key references an undeclared environment',
    path: 'spec.options.0.lines.0.amount.staging',
    line: 25,
  },
  {
    file: 'score-out-of-range.decision.yaml',
    kind: 'decision',
    reason: 'a criterion score is greater than 5',
    path: 'spec.options.0.scores.cost.score',
    line: 27,
  },
  {
    file: 'bad-schedule-pct.catalog.yaml',
    kind: 'catalog',
    reason: 'a schedule pct is greater than 1',
    path: 'spec.schedules.0.pct',
    line: 17,
  },
];
