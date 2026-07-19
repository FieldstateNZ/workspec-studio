// The worked example — a small but representative single tree plus two runs,
// built as typed LOCATED inputs (no YAML, no `node:fs`, so the fixture stays as
// pure as the engine). It deliberately exercises every derivation the golden
// test pins:
//
//   • coverage    — authoring-flow is covered (a passing verifier); three
//                   others are not, one of them an orphan.
//   • pass-rate   — a pass/fail/skip mix over the latest run, plus one sysreq
//                   absent from it (→ unproven).
//   • latest-run-wins — the OLDER run passes everything; the newer run's mixed
//                   verdicts are what the model reflects.
//   • findings    — orphan-userReq, orphan-feature, three dangling refs
//                   (actor / feature / userReqs), and a duplicate sysreq slug.
//
// The expected headline numbers (independently re-derived here so a regression
// is obvious without reading the snapshot): coverage 1/4, pass-rate 2/5,
// latest run = the 2026-07-09 run, 7 findings.

import type { Actor, Feature, SystemRequirement, UserRequirement } from '@workspec/req-schema';
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
      // Orphan user-requirement: no sysreq verifies it → the headline finding.
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
      // verified by outline-each-kind, so it is NOT an orphan — isolates the
      // dangling-actor finding.
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
      sysReq('inline-create-persists', 'requirements/system/inline-create-persists.yml', {
        title: 'Creating an element inline saves it immediately',
        feature: 'element-authoring',
        userReqs: ['authoring-flow'],
        then: ['the element is persisted'],
      }),
      sysReq('inline-create-each-kind', 'requirements/system/inline-create-each-kind.yml', {
        title: 'Inline create works for each element kind',
        feature: 'element-authoring',
        userReqs: ['authoring-flow'],
        then: ['a valid artifact is written'],
      }),
      sysReq('outline-each-kind', 'requirements/system/outline-each-kind.yml', {
        title: 'Outline covers each kind from the examples table',
        feature: 'element-authoring',
        userReqs: ['authoring-flow', 'ghost-actor-req'],
        then: ['each row produces a scenario'],
      }),
      sysReq('failing-run-surfaced', 'requirements/system/failing-run-surfaced.yml', {
        title: 'A failing scenario is surfaced in run review',
        feature: 'run-review',
        userReqs: ['review-failures'],
        then: ['the failure is listed first'],
      }),
      // Same slug as above from a second file → duplicate-slug (both files flagged).
      sysReq('failing-run-surfaced', 'requirements/system/failing-run-surfaced.copy.yml', {
        title: 'A failing scenario is surfaced in run review (copy)',
        feature: 'run-review',
        userReqs: ['review-failures'],
        then: ['the failure is listed first'],
      }),
      // In the tree but ABSENT from the latest run → unproven (even though the
      // older run passed it — proves latest-run-wins).
      sysReq('unproven-scenario', 'requirements/system/unproven-scenario.yml', {
        title: 'A scenario the latest run never reported on',
        feature: 'run-review',
        userReqs: ['review-failures'],
        then: ['it stays unproven until a run reports it'],
      }),
      // Dangling feature ref AND dangling userReqs ref → two dangling findings.
      sysReq('dangling-refs-scenario', 'requirements/system/dangling-refs-scenario.yml', {
        title: 'A scenario whose intra-tree refs do not resolve',
        feature: 'nonexistent-feature',
        userReqs: ['nonexistent-userreq'],
        then: ['the dangling-ref check catches both refs'],
      }),
    ],
  };
}

/**
 * Two runs. The older one passes everything; the newer one carries the mixed
 * verdicts the model must reflect — and omits `unproven-scenario` entirely.
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
        'outline-each-kind': 'pass',
        'failing-run-surfaced': 'pass',
        'unproven-scenario': 'pass',
        'dangling-refs-scenario': 'pass',
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
        'inline-create-each-kind': 'fail',
        'outline-each-kind': 'skip',
        'failing-run-surfaced': 'fail',
        'dangling-refs-scenario': 'pass',
        // unproven-scenario intentionally absent → derived `unproven`.
      },
    },
  ];
}
