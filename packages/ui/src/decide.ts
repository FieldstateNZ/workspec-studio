// Pure, immutable helpers for the decide flow (the ADR view's "Decide" action
// and the Compare view's "select winner" pick row). Recording an outcome, the
// "we accept X in exchange for Y" rationale seed, reopening a decision, and
// editing a decided rationale are all pure transforms over a decision — the view
// persists the result through the repository port. Nothing here is an LLM call
// (porting decision P7): the recommendation is engine-derived and the rationale
// is user-authored, seeded with a deterministic template.

import type { Decision, Outcome } from '@workspec/decision-schema';

/** Optional provenance stamped onto a recorded outcome. */
export interface DecideMeta {
  /** Who made the decision (e.g. a decider name). */
  decidedBy?: string;
  /** When it was decided, ISO 8601. */
  decidedAt?: string;
}

function lowerFirst(text: string): string {
  return text.length === 0 ? text : text[0]!.toLowerCase() + text.slice(1);
}

/**
 * A deterministic "we accept X in exchange for Y" rationale seed for choosing
 * `optionId`. Derived from the option's criteria scores — the lowest-scored
 * criterion is the trade-off accepted, the highest-scored the benefit bought.
 * Pure and locale-independent; the user is expected to refine it. Never empty,
 * so the seed always satisfies the schema's non-empty `rationale`.
 */
export function suggestRationale(decision: Decision, optionId: string): string {
  const option = decision.spec.options.find((o) => o.id === optionId);
  if (option === undefined) return `We choose ${optionId}.`;

  let strengthLabel: string | undefined;
  let weaknessLabel: string | undefined;
  let bestScore = -1;
  let worstScore = 6;
  for (const criterion of decision.spec.criteria) {
    const scored = option.scores[criterion.id];
    if (scored === undefined) continue;
    if (scored.score >= 4 && scored.score > bestScore) {
      bestScore = scored.score;
      strengthLabel = criterion.label;
    }
    if (scored.score <= 2 && scored.score < worstScore) {
      worstScore = scored.score;
      weaknessLabel = criterion.label;
    }
  }

  const benefit =
    strengthLabel !== undefined
      ? `a stronger ${lowerFirst(strengthLabel)}`
      : 'the strongest overall fit';
  const cost =
    weaknessLabel !== undefined
      ? `a weaker ${lowerFirst(weaknessLabel)}`
      : 'the associated trade-offs';
  return `We choose ${option.name}. We accept ${cost} in exchange for ${benefit}.`;
}

/**
 * Record an outcome on a decision: set `metadata.status` to `decided` and stamp
 * `spec.outcome`. Falls back to {@link suggestRationale} when `rationale` is
 * blank so the persisted artifact is always valid. Pure — returns a new decision.
 */
export function decide(
  decision: Decision,
  optionId: string,
  rationale: string,
  meta: DecideMeta = {},
): Decision {
  const trimmed = rationale.trim();
  const outcome: Outcome = {
    option: optionId,
    rationale: trimmed.length > 0 ? trimmed : suggestRationale(decision, optionId),
    ...(meta.decidedBy !== undefined && meta.decidedBy.length > 0
      ? { decidedBy: meta.decidedBy }
      : {}),
    ...(meta.decidedAt !== undefined && meta.decidedAt.length > 0
      ? { decidedAt: meta.decidedAt }
      : {}),
  };
  return {
    ...decision,
    metadata: { ...decision.metadata, status: 'decided' },
    spec: { ...decision.spec, outcome },
  };
}

/**
 * Reopen a decided decision: drop the recorded outcome and return to
 * `exploring`. Pure — returns a new decision.
 */
export function reopen(decision: Decision): Decision {
  const { outcome: _dropped, ...spec } = decision.spec;
  return {
    ...decision,
    metadata: { ...decision.metadata, status: 'exploring' },
    spec,
  };
}

/**
 * Replace the rationale on a decided decision's recorded outcome (inline edit).
 * A blank rationale is ignored (the outcome keeps its previous text) so the
 * artifact stays valid. No-op when there is no recorded outcome.
 */
export function setRationale(decision: Decision, rationale: string): Decision {
  const outcome = decision.spec.outcome;
  if (outcome === undefined) return decision;
  const trimmed = rationale.trim();
  if (trimmed.length === 0) return decision;
  return {
    ...decision,
    spec: { ...decision.spec, outcome: { ...outcome, rationale: trimmed } },
  };
}
