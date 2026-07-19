// The three meters (spec §5 + §4.7, never collapsed): scenario coverage,
// userReq coverage, and pass-rate. Each is `{ numerator, denominator, ratio }`
// — a bare float is never returned, so a UI/CLI can show "N of M" — and
// `ratio` is `1` when `denominator` is `0` (the vacuous case: nothing to
// cover / no evidence yet).

import type { Meter, ScenarioNode, UserReqNode } from './types.js';

/** `numerator/denominator`; `ratio` is `1` when `denominator` is `0` (vacuous). */
function meter(numerator: number, denominator: number): Meter {
  return { numerator, denominator, ratio: denominator === 0 ? 1 : numerator / denominator };
}

/** Scenarios with a result in the latest run ÷ all scenarios. */
export function scenarioCoverageMeter(scenarios: readonly ScenarioNode[]): Meter {
  const evidenced = scenarios.filter((s) => s.proof !== 'unproven').length;
  return meter(evidenced, scenarios.length);
}

/** UserReqs with ≥1 rule-proven verifying sysreq ÷ all userReqs. */
export function userReqCoverageMeter(userRequirements: readonly UserReqNode[]): Meter {
  return meter(userRequirements.filter((u) => u.covered).length, userRequirements.length);
}

/** Passing scenarios ÷ scenarios with evidence in the latest run (`skip` counts as evidence). */
export function passRateMeter(scenarios: readonly ScenarioNode[]): Meter {
  const evidenced = scenarios.filter((s) => s.proof !== 'unproven');
  return meter(evidenced.filter((s) => s.proof === 'pass').length, evidenced.length);
}
