// Rule (system-requirement) derivation: the scenarios a Rule groups, the
// "verifies" edge onto user-requirements, and the strict rule-proven
// predicate (spec §4.7: a Rule counts as proven only when it has ≥1 scenario
// AND every one of them is `pass` in the latest run). A Rule with no
// scenarios is `empty` — a requirement with no proof at all.

import type { SystemRequirement } from '@workspec/req-schema';
import type { Finding, Located, ScenarioNode, SourceLocation, SysReqNode } from './types.js';
import { sortedUnique } from './ordering.js';
import { makeFinding } from './findings.js';

/** The Rule derivation, plus the `verifiedBy` edge map user-requirement derivation needs next. */
export interface RuleDerivation {
  systemRequirements: SysReqNode[];
  /** userReq slug → Rule slugs whose `userReqs` include it (the "verifies" edge). */
  verifiedBy: Map<string, string[]>;
  findings: Finding[];
}

/** Derive every Rule's node from its scenarios (already evidence-joined) and its own spec fields. */
export function deriveRules(
  sysReqs: readonly Located<SystemRequirement>[],
  scenarioNodes: readonly ScenarioNode[],
): RuleDerivation {
  const scenariosByRule = new Map<string, string[]>();
  const proofByScenario = new Map<string, ScenarioNode['proof']>();
  for (const scenario of scenarioNodes) {
    proofByScenario.set(scenario.slug, scenario.proof);
    const list = scenariosByRule.get(scenario.systemRequirement);
    if (list) list.push(scenario.slug);
    else scenariosByRule.set(scenario.systemRequirement, [scenario.slug]);
  }

  const verifiedBy = new Map<string, string[]>();
  const findings: Finding[] = [];

  const systemRequirements: SysReqNode[] = sysReqs.map((located) => {
    const { slug, source } = located;
    const spec = located.artifact.spec;

    for (const target of spec.userReqs) {
      const list = verifiedBy.get(target);
      if (list) list.push(slug);
      else verifiedBy.set(target, [slug]);
    }

    const scenarios = sortedUnique(scenariosByRule.get(slug) ?? []);
    const empty = scenarios.length === 0;
    const ruleProven = !empty && scenarios.every((s) => proofByScenario.get(s) === 'pass');

    if (empty) {
      findings.push(emptyRuleFinding(slug, source));
    }

    return {
      slug,
      title: spec.title,
      feature: spec.feature,
      verifies: sortedUnique(spec.userReqs),
      scenarios,
      ruleProven,
      empty,
      source,
    } satisfies SysReqNode;
  });

  return { systemRequirements, verifiedBy, findings };
}

/** The `empty-rule` finding: a Rule with no scenarios — a requirement with no proof (spec §4.7). */
function emptyRuleFinding(slug: string, source: SourceLocation): Finding {
  return makeFinding({
    kind: 'empty-rule',
    severity: 'warning',
    message: `system-requirement "${slug}" is an empty rule: it groups no scenarios, so it has no proof`,
    file: source.file,
    line: source.line,
    slug,
  });
}
