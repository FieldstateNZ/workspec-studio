// The derivation engine: `buildModel(tree, runs) → TraceModel`.
//
// PURE and DETERMINISTIC — no IO, no DOM, no `Date.now()`/`Math.random()`, and
// it NEVER throws (every problem surfaces as a `Finding`). It derives — never
// stores — the traceability graph the spec §4.7 defines: the per-scenario
// evidence join, each Rule's `ruleProven`/`empty` predicates, the three
// meters, and the diagnostic findings.

import type {
  Actor,
  Feature,
  Scenario,
  SystemRequirement,
  TestRun,
  UserRequirement,
} from '@workspec/req-schema';
import type { Finding, TraceModel, TraceTree } from './types.js';
import { indexBySlug } from './indexing.js';
import { selectLatestRun, toRunRef } from './latest-run.js';
import { deriveScenarios } from './scenario-derivation.js';
import { deriveRules } from './rule-derivation.js';
import { deriveUserRequirements } from './user-req-derivation.js';
import { deriveFeatures } from './feature-derivation.js';
import { collectDanglingRefs } from './dangling-refs.js';
import { passRateMeter, scenarioCoverageMeter, userReqCoverageMeter } from './meters.js';
import { compareFindings } from './findings.js';

/**
 * Derive the full traceability model for one tree against its runs.
 *
 * v0 is latest-run-only (spec §9.4) and single-tree (spec §9.5). The result is
 * fully deterministic: every array is sorted, so identical input yields a
 * byte-identical value.
 */
export function buildModel(tree: TraceTree, runs: readonly TestRun[]): TraceModel {
  const actors = indexBySlug<Actor>(tree.actors, 'Actor');
  const features = indexBySlug<Feature>(tree.features, 'Feature');
  const userReqs = indexBySlug<UserRequirement>(tree.userRequirements, 'UserRequirement');
  const sysReqs = indexBySlug<SystemRequirement>(tree.systemRequirements, 'SystemRequirement');
  const scenarios = indexBySlug<Scenario>(tree.scenarios, 'Scenario');

  const latestRun = selectLatestRun(runs);

  const findings: Finding[] = [
    ...actors.findings,
    ...features.findings,
    ...userReqs.findings,
    ...sysReqs.findings,
    ...scenarios.findings,
  ];

  // ── Scenarios: the evidence join (spec §4.6 revision — keyed on the
  //    scenario slug, not the sysreq). ────────────────────────────────────────
  const scenarioNodes = deriveScenarios(scenarios.ordered, latestRun);

  // ── Rules (system-requirements): scenarios grouped, ruleProven/empty,
  //    and the verifies edge onto user-requirements. ─────────────────────────
  const {
    systemRequirements,
    verifiedBy,
    findings: ruleFindings,
  } = deriveRules(sysReqs.ordered, scenarioNodes);
  findings.push(...ruleFindings);

  const ruleProvenBySysReq = new Map(systemRequirements.map((s) => [s.slug, s.ruleProven]));

  // ── User-requirements: coverage predicate + the headline orphan finding ────
  const { userRequirements, findings: userReqFindings } = deriveUserRequirements(
    userReqs.ordered,
    verifiedBy,
    ruleProvenBySysReq,
  );
  findings.push(...userReqFindings);

  // ── Features: the userReq/sysreq groupings + not-fully-wired finding ───────
  const { features: featureNodes, findings: featureFindings } = deriveFeatures(
    features.ordered,
    userReqs.ordered,
    sysReqs.ordered,
  );
  findings.push(...featureFindings);

  // ── Dangling intra-tree refs (spec §4.7). Cross-layer `links` are NOT
  //    checked here — they are inert if unresolvable, by design. ──────────────
  findings.push(
    ...collectDanglingRefs(userReqs.ordered, sysReqs.ordered, scenarios.ordered, {
      actorSlugs: actors.canonical,
      featureSlugs: features.canonical,
      userReqSlugs: userReqs.canonical,
      sysReqSlugs: sysReqs.canonical,
    }),
  );

  findings.sort(compareFindings);

  return {
    latestRun: latestRun !== null ? toRunRef(latestRun) : null,
    scenarios: scenarioNodes,
    systemRequirements,
    userRequirements,
    features: featureNodes,
    scenarioCoverage: scenarioCoverageMeter(scenarioNodes),
    userReqCoverage: userReqCoverageMeter(userRequirements),
    passRate: passRateMeter(scenarioNodes),
    findings,
  };
}
