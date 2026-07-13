// Locks the split-ratio ordering fixed in the C5 review: on-disk artifacts
// serialize a rule's/assignment's split parts ALPHABETICALLY by value (see
// `@workspec/cost-engine`'s `serializeSplitValue` and the demo estate's
// `demo.attribution.yaml`), so every parsed object/array here hands the
// render sites parts in alphabetical order too. All three render sites must
// re-sort to the normative ratio-DESCENDING-then-value-ASCENDING order
// before rendering, or a 60/40 split reads backwards as 40/60.
import { describe, expect, it } from 'vitest';
import type { RuleType } from '@workspec/cost-schema';
import type { DimensionAssignment, SplitPart } from '@workspec/cost-engine';
import { assignChipsOf, cascadeValueLabel, sortedSplitEntries, splitCellLabel } from './format.js';

// Alphabetical-by-value order, exactly as a parsed `split: { atrium: 0.4,
// workspec: 0.6 }` YAML mapping (or a `SplitPart[]` built in that order)
// would hand it to us — atrium (0.4) before workspec (0.6).
const ALPHA_ORDERED_PARTS: readonly SplitPart[] = [
  { value: 'atrium', ratio: 0.4 },
  { value: 'workspec', ratio: 0.6 },
];

describe('sortedSplitEntries', () => {
  it('sorts ratio descending, breaking ties by value ascending', () => {
    expect(sortedSplitEntries(ALPHA_ORDERED_PARTS)).toEqual([
      { value: 'workspec', ratio: 0.6 },
      { value: 'atrium', ratio: 0.4 },
    ]);
  });

  it('breaks an exact ratio tie by value ascending', () => {
    expect(
      sortedSplitEntries([
        { value: 'zeta', ratio: 0.5 },
        { value: 'alpha', ratio: 0.5 },
      ]),
    ).toEqual([
      { value: 'alpha', ratio: 0.5 },
      { value: 'zeta', ratio: 0.5 },
    ]);
  });

  it('does not mutate its input', () => {
    const input = [...ALPHA_ORDERED_PARTS];
    sortedSplitEntries(input);
    expect(input).toEqual(ALPHA_ORDERED_PARTS);
  });
});

describe('assignChipsOf — split ratio order', () => {
  it('renders the rail chip ratio-descending even when the rule\'s split object is alphabetically keyed', () => {
    const rule: RuleType = {
      id: 'r2',
      name: 'Shared AKS split',
      match: { nameGlob: 'aks-shared' },
      split: { product: { atrium: 0.4, workspec: 0.6 } },
    };
    const chips = assignChipsOf(rule);
    const splitChip = chips.find((c) => c.key === 'split:product');
    expect(splitChip?.text).toBe('product split 60/40');
  });
});

describe('splitCellLabel — split ratio order', () => {
  it('renders the table cell ratio-descending given alphabetically-ordered parts', () => {
    expect(splitCellLabel(ALPHA_ORDERED_PARTS)).toBe('wo 60 / at 40');
  });
});

describe('cascadeValueLabel — split ratio order', () => {
  it('renders the cascade label ratio-descending given alphabetically-ordered parts', () => {
    const assignment: DimensionAssignment = { kind: 'split', parts: [...ALPHA_ORDERED_PARTS], provenance: 'r2' };
    expect(cascadeValueLabel(assignment)).toBe('split 60/40');
  });
});
