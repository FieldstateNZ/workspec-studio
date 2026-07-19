// A small but representative `TraceTree` + `TestRun[]` fixture for the
// `matrix` export's tests (mirrors `@workspec/trace-model`'s
// `worked-example.fixture.ts`, scoped to what the RTM projection needs to
// exercise). It deliberately covers, in one tree:
//
//   • mixed scenario proof — pass / fail / skip / unproven, across the SAME
//     Rule (`inline-create`) so `unproven-scenario`'s absence from the latest
//     run is meaningful, not just "a different Rule".
//   • an EMPTY Rule (`empty-rule`, no scenarios) — the synthetic placeholder
//     row `buildMatrixRows` contributes for it.
//   • a dangling scenario -> Rule ref (`dangling-rule-scenario` references
//     `ghost-rule`, which is not in the tree) — the Rule/Feature/Verifies
//     columns fall back to "shown as-authored" / empty per spec §4.8.
//   • a dangling Rule -> feature ref (`dangling-feature-rule` references
//     `ghost-feature`) — the Feature column alone falls back, the Rule
//     itself still resolves fully.
//   • escaping edge cases spread across fields: a pipe in a Rule title, a
//     comma + ampersand in a Feature name, a quote in a userReq title, and a
//     `<tag>` + comma + quote combined in one scenario title.
//
// The expected `MatrixRow[]` (order, dangling handling, escaping) is
// independently re-derived in `matrix-rows.test.ts`'s header comment so a
// regression is legible without re-deriving it from this fixture.

import type {
  Actor,
  Feature,
  Scenario,
  SystemRequirement,
  TestRun,
  UserRequirement,
} from '@workspec/req-schema';
import type { Located, TraceTree } from '@workspec/trace-model';

const API_VERSION = 'workspec.io/v1alpha1';

function feature(slug: string, name: string): Located<Feature> {
  return {
    slug,
    source: { file: `.workspec/features/${slug}.yaml` },
    artifact: { apiVersion: API_VERSION, kind: 'Feature', metadata: {}, spec: { name } },
  };
}

function userReq(slug: string, title: string): Located<UserRequirement> {
  return {
    slug,
    source: { file: `.workspec/requirements/user/${slug}.yaml` },
    artifact: {
      apiVersion: API_VERSION,
      kind: 'UserRequirement',
      metadata: {},
      spec: {
        title,
        actor: 'dev-lead',
        as: 'a dev lead',
        want: 'to do a thing',
        so: 'that value is delivered',
        features: ['element-authoring'],
        status: 'agreed',
      },
    },
  };
}

function rule(
  slug: string,
  opts: { title: string; feature: string; userReqs: string[] },
): Located<SystemRequirement> {
  return {
    slug,
    source: { file: `.workspec/requirements/system/${slug}.yaml` },
    artifact: {
      apiVersion: API_VERSION,
      kind: 'SystemRequirement',
      metadata: {},
      spec: { title: opts.title, feature: opts.feature, userReqs: opts.userReqs },
    },
  };
}

function scenario(
  slug: string,
  opts: { title: string; systemRequirement: string },
): Located<Scenario> {
  return {
    slug,
    source: { file: `.workspec/scenarios/${slug}.yaml` },
    artifact: {
      apiVersion: API_VERSION,
      kind: 'Scenario',
      metadata: {},
      spec: {
        title: opts.title,
        systemRequirement: opts.systemRequirement,
        then: ['the result is asserted'],
      },
    },
  };
}

/** The fixture tree every matrix-export test builds its model from. */
export function buildMatrixFixtureTree(): TraceTree {
  return {
    actors: [] as Located<Actor>[],
    features: [
      feature('element-authoring', 'Element authoring'),
      // Comma + ampersand: exercises CSV comma-quoting and HTML `&` escaping.
      feature('reporting', 'Reporting, Audit & Compliance'),
    ],
    userRequirements: [
      userReq('authoring-flow', 'Author an element without leaving the canvas'),
      // A literal quote: exercises CSV quote-doubling.
      userReq('quoting-flow', 'A promise with a "quote" inside'),
    ],
    systemRequirements: [
      rule('inline-create', {
        title: 'Inline element creation',
        feature: 'element-authoring',
        userReqs: ['authoring-flow'],
      }),
      // A pipe in the title: exercises Markdown pipe-escaping.
      rule('pipe-rule', {
        title: 'A Rule | with a pipe',
        feature: 'element-authoring',
        userReqs: ['authoring-flow', 'quoting-flow'],
      }),
      // EMPTY: no scenario references it -> the synthetic placeholder row.
      rule('empty-rule', {
        title: 'An empty rule with no scenarios',
        feature: 'reporting',
        userReqs: ['authoring-flow'],
      }),
      // Its OWN `feature` ref is dangling (`ghost-feature` is not in the tree).
      rule('dangling-feature-rule', {
        title: 'A rule whose feature ref is dangling',
        feature: 'ghost-feature',
        userReqs: ['authoring-flow'],
      }),
    ],
    scenarios: [
      scenario('inline-create-fails', {
        title: 'A failing scenario',
        systemRequirement: 'inline-create',
      }),
      scenario('inline-create-persists', {
        title: 'Creates and persists inline',
        systemRequirement: 'inline-create',
      }),
      // Absent from the run below -> derived `unproven`.
      scenario('unproven-scenario', {
        title: 'Never reported by any run',
        systemRequirement: 'inline-create',
      }),
      // `<tag>`, a comma, AND a quote in one title: exercises HTML `<`/`>`/`"`
      // escaping and CSV comma+quote-quoting together.
      scenario('pipe-scenario', {
        title: 'A scenario title with a <tag> and a comma, plus "quotes"',
        systemRequirement: 'pipe-rule',
      }),
      // Its Rule ref does NOT resolve (`ghost-rule` is not in the tree).
      scenario('dangling-rule-scenario', {
        title: 'A scenario whose Rule ref is dangling',
        systemRequirement: 'ghost-rule',
      }),
      scenario('dangling-feature-rule-scenario', {
        title: 'Proves the dangling-feature rule',
        systemRequirement: 'dangling-feature-rule',
      }),
    ],
  };
}

/** The single latest run every matrix-export test joins evidence from. `unproven-scenario` is deliberately absent. */
export function buildMatrixFixtureRuns(): TestRun[] {
  return [
    {
      id: 'r1',
      ts: '2026-07-14T09:30:00.000Z',
      sha: 'abc1234',
      emitter: 'cucumber',
      results: {
        'inline-create-fails': 'fail',
        'inline-create-persists': 'pass',
        'pipe-scenario': 'skip',
        'dangling-rule-scenario': 'pass',
        'dangling-feature-rule-scenario': 'pass',
      },
    },
  ];
}
