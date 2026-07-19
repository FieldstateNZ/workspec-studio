// Scenario derivation: the evidence join now happens HERE, per scenario
// (spec §4.6 revision — the scenario is the executed unit, so evidence keys
// on the scenario slug, not the sysreq/Rule).

import type { Scenario, TestRun } from '@workspec/req-schema';
import type { Evidence, Located, ScenarioNode, ScenarioProof } from './types.js';

/**
 * Build one `ScenarioNode` per canonical scenario: join the latest run's
 * verdict for its slug (absence → `unproven`), never setting `evidence` when
 * unproven.
 */
export function deriveScenarios(
  scenarios: readonly Located<Scenario>[],
  latestRun: TestRun | null,
): ScenarioNode[] {
  const results = latestRun?.results ?? {};

  return scenarios.map((located) => {
    const { slug, source } = located;
    const spec = located.artifact.spec;
    const status = results[slug];
    const proof: ScenarioProof = status ?? 'unproven';
    const evidence: Evidence | undefined =
      status !== undefined && latestRun !== null
        ? {
            scenario: slug,
            runId: latestRun.id,
            status,
            at: latestRun.ts,
            ...(latestRun.sha !== undefined ? { sha: latestRun.sha } : {}),
          }
        : undefined;

    return {
      slug,
      title: spec.title,
      systemRequirement: spec.systemRequirement,
      proof,
      ...(evidence !== undefined ? { evidence } : {}),
      source,
    } satisfies ScenarioNode;
  });
}
