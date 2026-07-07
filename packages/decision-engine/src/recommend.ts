// Weighted recommendation (porting decision P4). Over the COMPLETE options only,
// score each by weighted criteria fit minus normalised annual cost, and return
// the highest. The cost weighting is the normative constant COST_COEFFICIENT.

import type { Decision } from '@workspec/decision-schema';
import type { DecisionCostResult } from './types.js';

/**
 * Normative weight of cost in the recommendation, replacing the prototype's
 * hardcoded `(annual / maxAnnual) * 3`. Higher makes cost matter more relative
 * to the criteria scores. Any conforming implementation must use this value.
 */
export const COST_COEFFICIENT = 3;

/**
 * Recommend an option from a computed decision result.
 *
 * Over the complete options only:
 *   fit(option) = Σ over decision.criteria of (weight × (scores[id]?.score ?? 0))
 *                 − COST_COEFFICIENT × (annual / maxAnnual)
 * where `maxAnnual` is the maximum `annual` among complete options. Returns the
 * option id with the highest fit (ties resolve to decision option order), or
 * null if no option is complete. When every complete option has `annual === 0`
 * the cost term is treated as 0 (no division by zero).
 */
export function recommend(result: DecisionCostResult, decision: Decision): string | null {
  const completeOptions = decision.spec.options.filter(
    (option) => result.byOption[option.id]?.complete === true,
  );
  if (completeOptions.length === 0) return null;

  let maxAnnual = 0;
  for (const option of completeOptions) {
    const annual = result.byOption[option.id]?.annual ?? 0;
    if (annual > maxAnnual) maxAnnual = annual;
  }

  let bestId: string | null = null;
  let bestFit = -Infinity;
  for (const option of completeOptions) {
    const cost = result.byOption[option.id];
    if (cost === undefined) continue;

    let weighted = 0;
    for (const criterion of decision.spec.criteria) {
      const score = option.scores[criterion.id]?.score ?? 0;
      weighted += criterion.weight * score;
    }
    const costTerm = maxAnnual > 0 ? COST_COEFFICIENT * (cost.annual / maxAnnual) : 0;
    const fit = weighted - costTerm;

    if (fit > bestFit) {
      bestFit = fit;
      bestId = option.id;
    }
  }

  return bestId;
}

/** Convenience accessor for the cheapest complete option id (or null). */
export function cheapest(result: DecisionCostResult): string | null {
  return result.cheapestId;
}
