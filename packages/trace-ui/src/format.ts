// Pure presentation helpers shared by the views. Every colour value returned
// here is a `var(--*)` TOKEN REFERENCE (never a hex/rgb literal) — consumers
// thread the result into a `--chip-accent`-style CSS custom property (see
// `@workspec/cost-ui`'s `format.ts`/`styles.css` for the same recipe), so the
// grep-clean-of-local-tokens check (`zero-local-tokens.test.ts`) stays green.

import type { Meter, ScenarioProof, UserReqNode } from '@workspec/trace-model';

/** A meter's ratio as a fixed-point percentage string, e.g. `"66.7%"`. */
export function formatPercent(meter: Meter): string {
  return `${(meter.ratio * 100).toFixed(1)}%`;
}

/** A meter as `"N of M"`, e.g. `"6 of 7"` — the brief's required phrasing (never a bare percentage). */
export function formatMeterFraction(meter: Meter): string {
  return `${meter.numerator} of ${meter.denominator}`;
}

/** One scenario proof's short label, matching the spec's own vocabulary (§4.7: absence → "unproven", not "untested"). */
export const PROOF_LABEL: Record<ScenarioProof, string> = {
  pass: 'pass',
  fail: 'fail',
  skip: 'skip',
  unproven: 'unproven',
};

/** One scenario proof's accent token reference, for a `--chip-accent` custom property. */
export const PROOF_ACCENT: Record<ScenarioProof, string> = {
  pass: 'var(--accent)',
  fail: 'var(--danger)',
  skip: 'var(--warn)',
  unproven: 'var(--ink-fade)',
};

/** A user-requirement's lifecycle status accent token reference. */
export const STATUS_ACCENT: Record<UserReqNode['status'], string> = {
  draft: 'var(--ink-fade)',
  agreed: 'var(--type-persona)',
  implemented: 'var(--warn)',
  verified: 'var(--accent)',
};

/** Tally of scenario proofs — the repo-wide summary line under the meters bar. */
export interface ProofTally {
  pass: number;
  fail: number;
  skip: number;
  unproven: number;
}

/** Tallies a list of proofs into pass/fail/skip/unproven counts. */
export function tallyProofs(proofs: readonly ScenarioProof[]): ProofTally {
  const tally: ProofTally = { pass: 0, fail: 0, skip: 0, unproven: 0 };
  for (const proof of proofs) tally[proof] += 1;
  return tally;
}

/** Renders a {@link ProofTally} as `"N pass · N fail · N skip · N unproven"`. */
export function formatProofTally(tally: ProofTally): string {
  return `${tally.pass} pass · ${tally.fail} fail · ${tally.skip} skip · ${tally.unproven} unproven`;
}
