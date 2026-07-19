// The RTM projection: `TraceModel -> MatrixRow[]` (spec §5/§6). Pure — no IO,
// no clock — so identical input yields an identical row order every time
// (the byte-determinism the `matrix` export's golden tests pin). One row per
// scenario in the tree (the executed unit), plus one synthetic row per EMPTY
// Rule (spec §4.7: a Rule with no scenarios has no scenario row to appear on
// otherwise, and "a requirement with no proof at all" is precisely what an
// RTM must not hide).

import type {
  FeatureNode,
  ScenarioNode,
  SysReqNode,
  TraceModel,
  UserReqNode,
} from '@workspec/trace-model';
import type { MatrixRow } from './matrix-row.types.js';

/**
 * Scenario placeholder for an empty Rule's synthetic row. Exported so tests
 * assert against the same literal the implementation uses, rather than a
 * hand-copied string that could silently drift.
 */
export const EMPTY_RULE_SCENARIO_LABEL = '(no scenarios — empty rule)';

/** A row's sort key: (feature slug, Rule slug, scenario slug) — the deterministic order spec §6 requires. */
interface SortKey {
  readonly feature: string;
  readonly rule: string;
  readonly scenario: string;
}

/** Lexicographic compare over a `SortKey` triple: feature, then Rule, then scenario. */
function compareSortKeys(a: SortKey, b: SortKey): number {
  if (a.feature !== b.feature) return a.feature < b.feature ? -1 : 1;
  if (a.rule !== b.rule) return a.rule < b.rule ? -1 : 1;
  if (a.scenario !== b.scenario) return a.scenario < b.scenario ? -1 : 1;
  return 0;
}

/** Join a Rule's `verifies` userReq slugs into the display string, resolving each to its title (as-authored when dangling). */
function formatVerifies(
  verifies: readonly string[],
  userReqsBySlug: ReadonlyMap<string, UserReqNode>,
): string {
  return verifies.map((slug) => userReqsBySlug.get(slug)?.title ?? slug).join('; ');
}

/** Resolve a Rule's containing feature to its display name (as-authored when the ref is dangling). */
function formatFeature(
  featureSlug: string,
  featuresBySlug: ReadonlyMap<string, FeatureNode>,
): string {
  return featuresBySlug.get(featureSlug)?.name ?? featureSlug;
}

/** Build the one row a resolved scenario contributes, keyed for the deterministic sort. */
function scenarioRow(
  scenario: ScenarioNode,
  rulesBySlug: ReadonlyMap<string, SysReqNode>,
  featuresBySlug: ReadonlyMap<string, FeatureNode>,
  userReqsBySlug: ReadonlyMap<string, UserReqNode>,
): { key: SortKey; row: MatrixRow } {
  const rule = rulesBySlug.get(scenario.systemRequirement);

  return {
    key: {
      feature: rule !== undefined ? rule.feature : '',
      rule: rule?.slug ?? scenario.systemRequirement,
      scenario: scenario.slug,
    },
    row: {
      feature: rule !== undefined ? formatFeature(rule.feature, featuresBySlug) : '',
      // Dangling scenario -> Rule ref: shown as-authored (spec §4.8), never a title.
      rule: rule?.title ?? scenario.systemRequirement,
      scenario: scenario.title,
      verifies: rule !== undefined ? formatVerifies(rule.verifies, userReqsBySlug) : '',
      status: scenario.proof,
      run: scenario.evidence?.runId ?? '',
      sha: scenario.evidence?.sha ?? '',
    },
  };
}

/** Build the synthetic row an empty Rule (no scenarios) contributes — it has no scenario row otherwise. */
function emptyRuleRow(
  rule: SysReqNode,
  featuresBySlug: ReadonlyMap<string, FeatureNode>,
  userReqsBySlug: ReadonlyMap<string, UserReqNode>,
): { key: SortKey; row: MatrixRow } {
  return {
    key: { feature: rule.feature, rule: rule.slug, scenario: '' },
    row: {
      feature: formatFeature(rule.feature, featuresBySlug),
      rule: rule.title,
      scenario: EMPTY_RULE_SCENARIO_LABEL,
      verifies: formatVerifies(rule.verifies, userReqsBySlug),
      // Nothing proves an empty Rule — `unproven` keeps Status's vocabulary
      // closed to the four canonical values every scenario row also uses.
      status: 'unproven',
      run: '',
      sha: '',
    },
  };
}

/**
 * Project a derived `TraceModel` to the requirements-traceability matrix
 * (spec §5: "scenario rows grouped by Rule -> Feature, exportable"). Every
 * scenario in the tree gets exactly one row, in deterministic order (feature
 * slug, then Rule slug, then scenario slug — spec §6's byte-stable,
 * CI-diffable acceptance bar); every empty Rule contributes one more.
 */
export function buildMatrixRows(model: TraceModel): MatrixRow[] {
  const rulesBySlug = new Map(model.systemRequirements.map((r) => [r.slug, r]));
  const featuresBySlug = new Map(model.features.map((f) => [f.slug, f]));
  const userReqsBySlug = new Map(model.userRequirements.map((u) => [u.slug, u]));

  const ranked = [
    ...model.scenarios.map((s) => scenarioRow(s, rulesBySlug, featuresBySlug, userReqsBySlug)),
    ...model.systemRequirements
      .filter((r) => r.empty)
      .map((r) => emptyRuleRow(r, featuresBySlug, userReqsBySlug)),
  ];

  ranked.sort((a, b) => compareSortKeys(a.key, b.key));
  return ranked.map((r) => r.row);
}
