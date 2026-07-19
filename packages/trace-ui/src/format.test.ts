import { describe, expect, it } from 'vitest';
import { formatMeterFraction, formatPercent, formatProofTally, tallyProofs } from './format.js';

describe('formatPercent', () => {
  it('formats a ratio to one decimal place', () => {
    expect(formatPercent({ numerator: 2, denominator: 3, ratio: 2 / 3 })).toBe('66.7%');
  });

  it('formats the vacuous 0/0 meter as 100%', () => {
    expect(formatPercent({ numerator: 0, denominator: 0, ratio: 1 })).toBe('100.0%');
  });
});

describe('formatMeterFraction', () => {
  it('renders "N of M", never a bare percentage', () => {
    expect(formatMeterFraction({ numerator: 6, denominator: 7, ratio: 6 / 7 })).toBe('6 of 7');
  });
});

describe('tallyProofs / formatProofTally', () => {
  it('tallies pass/fail/skip/unproven counts', () => {
    const tally = tallyProofs(['pass', 'pass', 'fail', 'skip', 'unproven']);
    expect(tally).toEqual({ pass: 2, fail: 1, skip: 1, unproven: 1 });
  });

  it('renders the spec-vocabulary summary line ("unproven", not "untested")', () => {
    expect(formatProofTally({ pass: 4, fail: 1, skip: 1, unproven: 1 })).toBe(
      '4 pass · 1 fail · 1 skip · 1 unproven',
    );
  });
});
