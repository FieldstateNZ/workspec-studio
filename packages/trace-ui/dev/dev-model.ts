// The dev story's OWN model — a superset of the package's shared
// `test-helpers/trace-fixture.ts` tree, with one extra Rule/scenario proving
// a `skip` verdict layered on top. This file exists so the Run review tab
// (T7, #75) has an "interesting" latest run to screenshot — failures, skips,
// AND unproven scenarios together — without touching
// `test-helpers/trace-fixture.ts` itself: that fixture's numbers
// (scenarioCoverage/passRate/userReqCoverage, feature/scenario counts) are
// hardcoded across this package's OTHER view tests
// (`feature-detail.test.tsx`, `matrix-view.test.tsx`, `app.test.tsx`, …), so
// adding a scenario there would perturb every one of them. Building the
// superset here instead — the same precedent `matrix-view.test.tsx` set for
// a new-shape TEST fixture, applied to the dev story's fixture instead.
import { buildModel } from '@workspec/trace-model';
import type { Located, TestRun, TraceModel } from '@workspec/trace-model';
import type { Scenario, SystemRequirement } from '@workspec/req-schema';
import { buildFixtureRuns, buildFixtureTree } from '../src/test-helpers/trace-fixture.js';

const API_VERSION = 'workspec.io/v1alpha1';

function locatedSysReq(slug: string, spec: SystemRequirement['spec']): Located<SystemRequirement> {
  return {
    slug,
    source: { file: `requirements/system/${slug}.yaml`, line: 3 },
    artifact: { apiVersion: API_VERSION, kind: 'SystemRequirement', metadata: { slug }, spec },
  };
}

function locatedScenario(slug: string, spec: Scenario['spec']): Located<Scenario> {
  return {
    slug,
    source: { file: `scenarios/${slug}.yaml`, line: 3 },
    artifact: { apiVersion: API_VERSION, kind: 'Scenario', metadata: { slug }, spec },
  };
}

/** The shared fixture tree/run, plus one Rule whose one scenario the latest run explicitly SKIPPED. */
export function buildDevModel(): TraceModel {
  const tree = buildFixtureTree();
  const runs = buildFixtureRuns();

  const richerTree = {
    ...tree,
    systemRequirements: [
      ...tree.systemRequirements,
      locatedSysReq('skip-rule', {
        title: 'A rule whose scenario the run explicitly skipped',
        feature: 'element-authoring',
        userReqs: ['authoring-flow'],
        links: [],
      }),
    ],
    scenarios: [
      ...tree.scenarios,
      locatedScenario('skipped-scenario', {
        title: 'A scenario the latest run recorded as skipped',
        systemRequirement: 'skip-rule',
        then: ['it is recorded as skipped, not run'],
      }),
    ],
  };

  const richerRuns: TestRun[] = runs.map((run) => ({
    ...run,
    results: { ...run.results, 'skipped-scenario': 'skip' },
  }));

  return buildModel(richerTree, richerRuns);
}
