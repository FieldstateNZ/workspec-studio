// The worked example — a small but representative single tree plus two runs,
// built as typed LOCATED inputs (no YAML, no `node:fs`, so the fixture stays
// as pure as the engine). It deliberately exercises every derivation the
// golden test pins, across the 5-kind Rule model (spec §4):
//
//   • scenarioCoverage — 6 of 7 scenarios have a result in the latest run
//                        (`unproven-scenario` is absent).
//   • passRate         — a pass/fail/skip mix over the latest run's 6
//                        evidenced scenarios: 4 pass.
//   • userReqCoverage  — only `authoring-flow` has a rule-proven verifier
//                        (1 of 4).
//   • ruleProven       — all four cases: all-pass (`inline-create`),
//                        one-failing (`failing-run-surfaced`),
//                        one-unproven (`unproven-rule`), and empty
//                        (`empty-rule`, which groups no scenarios at all).
//   • latest-run-wins  — the OLDER run passes everything; the newer run's
//                        mixed verdicts are what the model reflects.
//   • findings         — orphan-userReq, orphan-feature, empty-rule, four
//                        dangling refs (actor / Rule-feature / Rule-userReqs /
//                        scenario-systemRequirement), and a duplicate Rule
//                        slug.
//
// The expected headline numbers (independently re-derived here so a
// regression is obvious without reading the snapshot): scenarioCoverage 6/7,
// passRate 4/6 (= 2/3), userReqCoverage 1/4, 9 findings.

import type {
  Actor,
  Feature,
  Scenario,
  SystemRequirement,
  UserRequirement,
} from '@workspec/req-schema';
import type { Located, TestRun, TraceTree } from './types.js';

const API_VERSION = 'workspec.io/v1alpha1';

function actor(slug: string, file: string, name: string): Located<Actor> {
  return {
    slug,
    source: { file, line: 3 },
    artifact: {
      apiVersion: API_VERSION,
      kind: 'Actor',
      metadata: { slug },
      spec: { name },
    },
  };
}

function feature(slug: string, file: string, name: string): Located<Feature> {
  return {
    slug,
    source: { file, line: 3 },
    artifact: {
      apiVersion: API_VERSION,
      kind: 'Feature',
      metadata: { slug },
      spec: { name },
    },
  };
}

function userReq(
  slug: string,
  file: string,
  spec: UserRequirement['spec'],
): Located<UserRequirement> {
  return {
    slug,
    source: { file, line: 4 },
    artifact: { apiVersion: API_VERSION, kind: 'UserRequirement', metadata: { slug }, spec },
  };
}

/** A system-requirement — a Gherkin Rule: no steps of its own, groups scenarios. */
function sysReq(
  slug: string,
  file: string,
  spec: SystemRequirement['spec'],
): Located<SystemRequirement> {
  return {
    slug,
    source: { file, line: 4 },
    artifact: { apiVersion: API_VERSION, kind: 'SystemRequirement', metadata: { slug }, spec },
  };
}

/** A scenario — the executed unit — referencing its parent Rule via `systemRequirement`. */
function scenario(slug: string, file: string, spec: Scenario['spec']): Located<Scenario> {
  return {
    slug,
    source: { file, line: 4 },
    artifact: { apiVersion: API_VERSION, kind: 'Scenario', metadata: { slug }, spec },
  };
}

/** The worked-example tree (single tree, spec §9.5). */
export function buildWorkedExample(): TraceTree {
  return {
    actors: [
      actor('dev-lead', 'actors/dev-lead.yml', 'Dev lead'),
      actor('reviewer', 'actors/reviewer.yml', 'Reviewer'),
    ],
    features: [
      feature('element-authoring', 'features/element-authoring.yml', 'Element authoring'),
      feature('run-review', 'features/run-review.yml', 'Run review'),
      // Orphan feature: nothing attaches on either side → orphan-feature finding.
      feature('reporting', 'features/reporting.yml', 'Reporting'),
    ],
    userRequirements: [
      userReq('authoring-flow', 'requirements/user/authoring-flow.yml', {
        title: 'Author an element without leaving the canvas',
        actor: 'dev-lead',
        as: 'a dev lead',
        want: 'to author a new element inline on the canvas',
        so: "that I don't break flow switching to a form",
        features: ['element-authoring'],
        status: 'agreed',
        links: [],
      }),
      userReq('review-failures', 'requirements/user/review-failures.yml', {
        title: 'See which scenarios failed in the latest run',
        actor: 'reviewer',
        as: 'a reviewer',
        want: 'to see failing scenarios foregrounded',
        so: 'that I can act on regressions quickly',
        features: ['run-review'],
        status: 'agreed',
        links: [],
      }),
      // Orphan user-requirement: no Rule verifies it → the headline finding.
      userReq('audit-export', 'requirements/user/audit-export.yml', {
        title: 'Export the RTM as a compliance artifact',
        actor: 'dev-lead',
        as: 'a dev lead',
        want: 'to export the requirements traceability matrix',
        so: 'that I can hand it to an auditor',
        features: ['element-authoring'],
        status: 'draft',
        links: [],
      }),
      // Dangling actor ref (`ghost-actor` is not an actor in the tree); still
      // verified by `outline-each-kind`, so it is NOT an orphan — isolates
      // the dangling-actor finding.
      userReq('ghost-actor-req', 'requirements/user/ghost-actor-req.yml', {
        title: 'A requirement pointing at a missing actor',
        actor: 'ghost-actor',
        as: 'a ghost',
        want: 'to reference an actor that was deleted',
        so: 'that the dangling-ref check has something to catch',
        features: ['element-authoring'],
        status: 'draft',
        links: [],
      }),
    ],
    systemRequirements: [
      // ALL-PASS: every scenario it groups passes → ruleProven.
      sysReq('inline-create', 'requirements/system/inline-create.yml', {
        title: 'Inline element creation',
        feature: 'element-authoring',
        userReqs: ['authoring-flow'],
        links: [],
      }),
      // ONE scenario, skipped: not all-pass, not empty → not ruleProven.
      sysReq('outline-each-kind', 'requirements/system/outline-each-kind.yml', {
        title: 'Outline covers each kind from the examples table',
        feature: 'element-authoring',
        userReqs: ['authoring-flow', 'ghost-actor-req'],
        links: [],
      }),
      // ONE-FAILING: its one scenario fails → not ruleProven.
      sysReq('failing-run-surfaced', 'requirements/system/failing-run-surfaced.yml', {
        title: 'A failing scenario is surfaced in run review',
        feature: 'run-review',
        userReqs: ['review-failures'],
        links: [],
      }),
      // Same slug as above from a second file → duplicate-slug (both files flagged).
      sysReq('failing-run-surfaced', 'requirements/system/failing-run-surfaced.copy.yml', {
        title: 'A failing scenario is surfaced in run review (copy)',
        feature: 'run-review',
        userReqs: ['review-failures'],
        links: [],
      }),
      // ONE-UNPROVEN: its one scenario is absent from the latest run → not ruleProven.
      sysReq('unproven-rule', 'requirements/system/unproven-rule.yml', {
        title: 'A rule whose scenario the latest run never reported on',
        feature: 'run-review',
        userReqs: ['review-failures'],
        links: [],
      }),
      // EMPTY: groups no scenarios at all → empty-rule finding, not ruleProven.
      sysReq('empty-rule', 'requirements/system/empty-rule.yml', {
        title: 'A rule with no scenarios yet',
        feature: 'element-authoring',
        userReqs: ['authoring-flow'],
        links: [],
      }),
      // Dangling feature ref AND dangling userReqs ref → two dangling findings.
      sysReq('dangling-refs-rule', 'requirements/system/dangling-refs-rule.yml', {
        title: 'A rule whose intra-tree refs do not resolve',
        feature: 'nonexistent-feature',
        userReqs: ['nonexistent-userreq'],
        links: [],
      }),
    ],
    scenarios: [
      scenario('inline-create-persists', 'scenarios/inline-create-persists.yml', {
        title: 'Creating an element inline saves it immediately',
        systemRequirement: 'inline-create',
        then: ['the element is persisted'],
      }),
      scenario('inline-create-each-kind', 'scenarios/inline-create-each-kind.yml', {
        title: 'Inline create works for each element kind',
        systemRequirement: 'inline-create',
        then: ['a valid artifact is written'],
      }),
      scenario('outline-each-kind-scenario', 'scenarios/outline-each-kind-scenario.yml', {
        title: 'Outline covers each kind from the examples table',
        systemRequirement: 'outline-each-kind',
        then: ['each row produces a scenario'],
      }),
      scenario('failing-run-surfaced-scenario', 'scenarios/failing-run-surfaced-scenario.yml', {
        title: 'A failing scenario is surfaced in run review',
        systemRequirement: 'failing-run-surfaced',
        then: ['the failure is listed first'],
      }),
      // In the tree but ABSENT from the latest run → unproven (even though the
      // older run passed it — proves latest-run-wins).
      scenario('unproven-scenario', 'scenarios/unproven-scenario.yml', {
        title: 'A scenario the latest run never reported on',
        systemRequirement: 'unproven-rule',
        then: ['it stays unproven until a run reports it'],
      }),
      scenario('dangling-refs-rule-scenario', 'scenarios/dangling-refs-rule-scenario.yml', {
        title: "A scenario belonging to a rule whose OWN refs don't resolve",
        systemRequirement: 'dangling-refs-rule',
        then: ['the rule-level dangling refs are still caught'],
      }),
      // Dangling systemRequirement ref → the fifth-kind dangling finding.
      scenario('scenario-dangling-systemreq', 'scenarios/scenario-dangling-systemreq.yml', {
        title: "A scenario whose parent rule ref doesn't resolve",
        systemRequirement: 'nonexistent-rule',
        then: ['the dangling-ref check catches the scenario→rule ref too'],
      }),
    ],
  };
}

/**
 * Two runs. The older one passes everything; the newer one carries the mixed
 * verdicts the model must reflect — and omits `unproven-scenario` entirely.
 * Keyed on the SCENARIO slug (spec §4.6 revision).
 */
export function buildWorkedExampleRuns(): TestRun[] {
  return [
    {
      id: '2026-07-08T10-00Z',
      ts: '2026-07-08T10:00:00Z',
      emitter: 'cucumber',
      results: {
        'inline-create-persists': 'pass',
        'inline-create-each-kind': 'pass',
        'outline-each-kind-scenario': 'pass',
        'failing-run-surfaced-scenario': 'pass',
        'unproven-scenario': 'pass',
        'dangling-refs-rule-scenario': 'pass',
        'scenario-dangling-systemreq': 'pass',
      },
    },
    {
      id: '2026-07-09T02-14Z',
      ts: '2026-07-09T02:14:07Z',
      sha: 'a1b2c3d',
      ci: 'github-actions',
      emitter: 'cucumber',
      results: {
        'inline-create-persists': 'pass',
        'inline-create-each-kind': 'pass',
        'outline-each-kind-scenario': 'skip',
        'failing-run-surfaced-scenario': 'fail',
        'dangling-refs-rule-scenario': 'pass',
        'scenario-dangling-systemreq': 'pass',
        // unproven-scenario intentionally absent → derived `unproven`.
      },
    },
  ];
}
