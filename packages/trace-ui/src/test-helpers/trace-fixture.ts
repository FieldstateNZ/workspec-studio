// A compact, hand-built `TraceModel` fixture — small enough to hand-verify,
// rich enough to exercise every view-rendering branch this package's own
// tests need (a covered userReq, an orphan userReq, a proven Rule, a failing
// Rule, an EMPTY Rule, an unproven scenario, and an orphan/uncovered
// FEATURE). It is deliberately NOT trace-model's own worked example
// (`worked-example.fixture.ts`) — that fixture is internal to
// `@workspec/trace-model`'s own test suite and isn't part of its public
// `index.ts` export surface; reaching into a sibling package's `src/` for
// executable fixture logic (rather than published data) would break the
// package boundary. Instead this builds its own small `TraceTree` + runs from
// PUBLIC `@workspec/req-schema` artifact types and derives the model through
// the real, public `buildModel()` — exercising the exact composition a real
// host performs, not a hand-rolled `TraceModel` literal.
//
// Expected headline numbers (re-derived here so a regression is obvious
// without reading a test's assertions):
//   • scenarioCoverage — 2 of 3 (unproven-scenario is absent from the run)
//   • passRate         — 1 of 2 (inline-create-persists pass, flaky-scenario fail)
//   • userReqCoverage  — 1 of 3 (authoring-flow covered; audit-export and
//                        tap-support both orphan) — deliberately DISTINCT
//                        from passRate's 1/2 so a test can't pass by accident
//                        on two meters reading the same field.
//   • findings         — orphan-user-requirement ×2 (audit-export,
//                        tap-support), empty-rule (empty-rule), orphan-feature
//                        (reporting — has a userReq but zero sysreqs)

import { buildModel } from '@workspec/trace-model';
import type { Located, TestRun, TraceModel, TraceTree } from '@workspec/trace-model';
import type {
  Actor,
  Feature,
  Scenario,
  SystemRequirement,
  UserRequirement,
} from '@workspec/req-schema';

const API_VERSION = 'workspec.io/v1alpha1';

function located<A>(slug: string, file: string, artifact: A): Located<A> {
  return { slug, source: { file, line: 3 }, artifact };
}

function actor(slug: string, name: string): Located<Actor> {
  return located(slug, `actors/${slug}.yaml`, {
    apiVersion: API_VERSION,
    kind: 'Actor',
    metadata: { slug },
    spec: { name },
  });
}

function feature(slug: string, name: string): Located<Feature> {
  return located(slug, `features/${slug}.yaml`, {
    apiVersion: API_VERSION,
    kind: 'Feature',
    metadata: { slug },
    spec: { name },
  });
}

function userReq(slug: string, spec: UserRequirement['spec']): Located<UserRequirement> {
  return located(slug, `requirements/user/${slug}.yaml`, {
    apiVersion: API_VERSION,
    kind: 'UserRequirement',
    metadata: { slug },
    spec,
  });
}

function sysReq(slug: string, spec: SystemRequirement['spec']): Located<SystemRequirement> {
  return located(slug, `requirements/system/${slug}.yaml`, {
    apiVersion: API_VERSION,
    kind: 'SystemRequirement',
    metadata: { slug },
    spec,
  });
}

function scenario(slug: string, spec: Scenario['spec']): Located<Scenario> {
  return located(slug, `scenarios/${slug}.yaml`, {
    apiVersion: API_VERSION,
    kind: 'Scenario',
    metadata: { slug },
    spec,
  });
}

/**
 * The fixture tree. `element-authoring` carries a proven Rule, a failing
 * Rule, and an empty Rule (three of the four `ruleProven`/`empty` cases);
 * `reporting` is a fully orphan feature (spec §4.7: no userReqs AND no
 * sysreqs) — the explicit "no system requirements" case Feature detail must
 * render.
 */
export function buildFixtureTree(): TraceTree {
  return {
    actors: [actor('dev-lead', 'Dev lead')],
    features: [
      feature('element-authoring', 'Element authoring'),
      // Orphan feature: no userReqs, no sysreqs — the "uncovered" case.
      feature('reporting', 'Reporting'),
    ],
    userRequirements: [
      userReq('authoring-flow', {
        title: 'Author an element without leaving the canvas',
        actor: 'dev-lead',
        as: 'a dev lead',
        want: 'to author a new element inline on the canvas',
        so: "that I don't break flow switching to a form",
        features: ['element-authoring'],
        status: 'agreed',
        links: [],
      }),
      // Orphan user-requirement: no Rule verifies it — the headline finding.
      userReq('audit-export', {
        title: 'Export the RTM as a compliance artifact',
        actor: 'dev-lead',
        as: 'a dev lead',
        want: 'to export the requirements traceability matrix',
        so: 'that I can hand it to an auditor',
        features: ['element-authoring'],
        status: 'draft',
        links: [],
      }),
      // A second orphan userReq, attached to the `reporting` feature — gives
      // `reporting` a non-empty `userRequirements[]` while it STILL has zero
      // `systemRequirements[]`, so Feature detail's "no system requirements"
      // explicit empty state renders alongside a real userReq row, not just
      // on a fully-empty feature.
      userReq('tap-support', {
        title: 'TAP result support',
        actor: 'dev-lead',
        as: 'an engineer',
        want: 'TAP output ingested alongside JUnit',
        so: 'non-JVM runners join the matrix too',
        features: ['reporting'],
        status: 'draft',
        links: [],
      }),
    ],
    systemRequirements: [
      // PROVEN: its one scenario passes.
      sysReq('inline-create', {
        title: 'Inline element creation',
        feature: 'element-authoring',
        userReqs: ['authoring-flow'],
        links: [],
      }),
      // FAILING: its one scenario fails.
      sysReq('flaky-rule', {
        title: 'A rule whose scenario regressed',
        feature: 'element-authoring',
        userReqs: ['authoring-flow'],
        links: [],
      }),
      // EMPTY: groups no scenarios at all — a requirement with no proof.
      sysReq('empty-rule', {
        title: 'A rule with no scenarios yet',
        feature: 'element-authoring',
        userReqs: ['authoring-flow'],
        links: [],
      }),
      // UNPROVEN: its one scenario is absent from the latest run.
      sysReq('unproven-rule', {
        title: 'A rule whose scenario the latest run never reported on',
        feature: 'element-authoring',
        userReqs: ['authoring-flow'],
        links: [],
      }),
    ],
    scenarios: [
      scenario('inline-create-persists', {
        title: 'Creating an element inline saves it immediately',
        systemRequirement: 'inline-create',
        then: ['the element is persisted'],
      }),
      scenario('flaky-scenario', {
        title: 'A scenario that regressed in the latest run',
        systemRequirement: 'flaky-rule',
        then: ['it used to pass'],
      }),
      // In the tree but ABSENT from the run below → derived `unproven`.
      scenario('unproven-scenario', {
        title: 'A scenario the latest run never reported on',
        systemRequirement: 'unproven-rule',
        then: ['it stays unproven until a run reports it'],
      }),
    ],
  };
}

/** One run: passes `inline-create-persists`, fails `flaky-scenario`, and omits `unproven-scenario` entirely. */
export function buildFixtureRuns(): TestRun[] {
  return [
    {
      id: '2026-07-09T02-14Z',
      ts: '2026-07-09T02:14:07Z',
      sha: 'a1b2c3d',
      ci: 'github-actions',
      emitter: 'cucumber',
      results: {
        'inline-create-persists': 'pass',
        'flaky-scenario': 'fail',
      },
    },
  ];
}

/** The fixture `TraceModel`, derived through the real `buildModel()`. */
export function buildFixtureModel(): TraceModel {
  return buildModel(buildFixtureTree(), buildFixtureRuns());
}

/** The same tree with zero runs ingested — `latestRun === null`, every scenario `unproven`. */
export function buildFixtureModelWithoutRuns(): TraceModel {
  return buildModel(buildFixtureTree(), []);
}
