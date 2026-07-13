// Manifest for the invalid-fixture battery in `test/fixtures/invalid/`.
//
// Each entry names a fixture that MUST fail validation, the artifact kind it
// should be parsed as, and the expected first-issue `path` + source `line`.
// The fixtures/tests together prove that (a) each distinct failure mode is
// rejected and (b) the Zod-issue-path → YAML-line mapping is correct.

export interface InvalidCase {
  /** Filename under `test/fixtures/invalid/`. */
  file: string;
  /** Which parser to run. */
  kind: 'inventory' | 'spend' | 'attribution' | 'tagplan';
  /** What is wrong (documentation only). */
  reason: string;
  /** Expected dotted path of the reported issue. */
  path: string;
  /** Expected 1-based YAML line of that issue. */
  line: number;
}

export const invalidCases: readonly InvalidCase[] = [
  {
    file: 'unsorted-resources.inventory.yaml',
    kind: 'inventory',
    reason: 'resources[] is not sorted ascending by id (the sort-order contract)',
    path: 'spec.resources.1.id',
    line: 18,
  },
  {
    file: 'duplicate-resource-id.inventory.yaml',
    kind: 'inventory',
    reason: 'two resources share the same id',
    path: 'spec.resources.1.id',
    line: 18,
  },
  {
    file: 'bad-currency.spend.yaml',
    kind: 'spend',
    reason: 'currency is lowercase, not an ISO 4217 code',
    path: 'spec.rows.0.currency',
    line: 10,
  },
  {
    file: 'bad-period.spend.yaml',
    kind: 'spend',
    reason: 'period month "13" is out of range',
    path: 'spec.rows.0.period',
    line: 11,
  },
  {
    file: 'unresolved-with-resource-id.spend.yaml',
    kind: 'spend',
    reason: 'unresolved row also carries a resourceId',
    path: 'spec.rows.0.resourceId',
    line: 8,
  },
  {
    file: 'unknown-dimension-in-assign.attribution.yaml',
    kind: 'attribution',
    reason: 'rule assign references a dimension not declared in spec.dimensions',
    path: 'spec.rules.0.assign.team',
    line: 16,
  },
  {
    file: 'undeclared-value-id.attribution.yaml',
    kind: 'attribution',
    reason: 'rule assign references a value id not declared on the dimension',
    path: 'spec.rules.0.assign.product',
    line: 16,
  },
  {
    file: 'split-ratios-not-one.attribution.yaml',
    kind: 'attribution',
    reason: 'a split ratio map does not sum to 1',
    path: 'spec.rules.0.split.product',
    line: 17,
  },
  {
    file: 'rule-with-no-effect.attribution.yaml',
    kind: 'attribution',
    reason: 'a rule has none of assign/split/fromTag',
    path: 'spec.rules.0',
    line: 12,
  },
  {
    file: 'dimension-in-two-effects.attribution.yaml',
    kind: 'attribution',
    reason: 'the same dimension id appears in two effect fields on one rule',
    path: 'spec.rules.0.fromTag.product',
    line: 18,
  },
  {
    file: 'action-inconsistency.tagplan.yaml',
    kind: 'tagplan',
    reason: 'action "add" requires current to be null, but it is set',
    path: 'spec.entries.0.current',
    line: 13,
  },
  {
    file: 'unsorted-entries.tagplan.yaml',
    kind: 'tagplan',
    reason: 'entries[] is not sorted ascending by (resourceId, tag) (the sort-order contract)',
    path: 'spec.entries.1',
    line: 16,
  },
];
