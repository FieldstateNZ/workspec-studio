// Building the `Emitter.emit` input from a traceability tree: pair every Rule
// (system-requirement) with the scenarios that reference it. This is the one
// canonical place the grouping lives — both the round-trip conformance harness
// and the `workspec-trace emit` CLI consume it, so it does not drift between
// them (spec §4.4/§4.5).

import type { TraceTree } from '@workspec/trace-model';
import type { RuleInput, RuleWithScenarios, ScenarioInput } from './types.js';

/**
 * Group a tree's scenarios under their parent Rule slug
 * (`scenario.systemRequirement`), then pair every Rule with the scenarios it
 * groups — the `Emitter.emit` input shape. A Rule with no scenarios still
 * appears, with an empty `scenarios` array (an "empty rule", spec §4.7).
 *
 * A scenario whose `systemRequirement` matches no Rule in `tree` is NOT emitted
 * (it lands under a map key nothing retrieves). Callers that want to surface
 * that — e.g. the CLI's `emit` — should compare against the Rule slug set
 * themselves; the derivation engine already flags it as a `dangling-ref`.
 */
export function groupScenariosByRule(tree: TraceTree): RuleWithScenarios[] {
  const scenariosByRule = new Map<string, ScenarioInput[]>();
  for (const located of tree.scenarios) {
    const ruleSlug = located.artifact.spec.systemRequirement;
    const input: ScenarioInput = { slug: located.slug, artifact: located.artifact };
    const list = scenariosByRule.get(ruleSlug);
    if (list) list.push(input);
    else scenariosByRule.set(ruleSlug, [input]);
  }

  return tree.systemRequirements.map((located) => {
    const sysreq: RuleInput = { slug: located.slug, artifact: located.artifact };
    return { sysreq, scenarios: scenariosByRule.get(located.slug) ?? [] };
  });
}
