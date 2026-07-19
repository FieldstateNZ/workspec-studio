import { describe, expect, it } from 'vitest';
import type { Scenario, SystemRequirement } from '@workspec/req-schema';
import { junitEmitter } from './junit.js';
import type { RuleWithScenarios, ScenarioInput } from './types.js';

function rule(slug: string, spec: SystemRequirement['spec']): RuleWithScenarios['sysreq'] {
  return {
    slug,
    artifact: {
      apiVersion: 'workspec.io/v1alpha1',
      kind: 'SystemRequirement',
      metadata: { slug },
      spec,
    },
  };
}

function scenarioInput(slug: string, spec: Scenario['spec']): ScenarioInput {
  return {
    slug,
    artifact: { apiVersion: 'workspec.io/v1alpha1', kind: 'Scenario', metadata: { slug }, spec },
  };
}

const inlineCreate: RuleWithScenarios = {
  sysreq: rule('inline-create', {
    title: 'Inline element creation',
    feature: 'element-authoring',
    userReqs: ['authoring-flow'],
    links: [],
  }),
  scenarios: [
    scenarioInput('inline-create-persists', {
      title: 'Creating an element inline saves it immediately',
      systemRequirement: 'inline-create',
      given: ['a canvas with no selected element'],
      when: ['the dev lead double-clicks empty canvas'],
      then: ['the element is persisted'],
    }),
    scenarioInput('inline-create-each-kind', {
      title: 'Inline create works for each element kind',
      systemRequirement: 'inline-create',
      then: ['a valid "<kind>" artifact is written'],
      examples: [{ kind: 'component' }, { kind: 'container' }, { kind: 'database' }],
    }),
  ],
};

const runReview: RuleWithScenarios = {
  sysreq: rule('failing-run-surfaced', {
    title: 'A failing scenario is surfaced in run review',
    feature: 'run-review',
    userReqs: ['review-failures'],
    links: [],
  }),
  scenarios: [
    scenarioInput('failing-run-surfaced-scenario', {
      title: 'A failing scenario is surfaced in run review',
      systemRequirement: 'failing-run-surfaced',
      then: ['the failure is listed first'],
    }),
  ],
};

describe('junitEmitter.emit', () => {
  it('emits one JUnit XML file per Rule, named on the Rule slug (testsuite-file-per-rule)', () => {
    const files = junitEmitter.emit([inlineCreate, runReview]);
    expect(files.map((f) => f.path)).toEqual(['failing-run-surfaced.xml', 'inline-create.xml']);
  });

  it('returns files deterministically sorted by path regardless of input order', () => {
    const a = junitEmitter.emit([inlineCreate, runReview]);
    const b = junitEmitter.emit([runReview, inlineCreate]);
    expect(a).toEqual(b);
  });

  it('names each testcase with its OWN scenario slug (req-slug-as-testcase-name — the ingest binding)', () => {
    const [file] = junitEmitter.emit([inlineCreate]);
    expect(file?.content).toContain('name="inline-create-persists"');
    expect(file?.content).toContain('name="inline-create-each-kind"');
  });

  it('groups multiple scenarios under one testsuite (rule-groups-testcases)', () => {
    const [file] = junitEmitter.emit([inlineCreate]);
    expect(file?.content).toContain('<testsuite name="Inline element creation" tests="2">');
    expect(file?.content.match(/<testcase /g)?.length).toBe(2);
    expect(file?.content).toContain('classname="inline-create"');
  });

  it('emits exactly one testcase for an outline scenario regardless of its examples count (outline-row-fold)', () => {
    const [file] = junitEmitter.emit([inlineCreate]);
    const nameCount = file?.content.match(/name="inline-create-each-kind"/g)?.length;
    expect(nameCount).toBe(1);
  });

  it('emits a single self-closing empty testsuite for an empty rule (no scenarios)', () => {
    const empty: RuleWithScenarios = {
      sysreq: rule('empty-rule', {
        title: 'A rule with no scenarios yet',
        feature: 'element-authoring',
        userReqs: ['authoring-flow'],
        links: [],
      }),
      scenarios: [],
    };
    const [file] = junitEmitter.emit([empty]);
    expect(file?.path).toBe('empty-rule.xml');
    expect(file?.content).toMatchInlineSnapshot(`
      "<?xml version="1.0" encoding="UTF-8"?>
      <testsuite name="A rule with no scenarios yet" tests="0"/>
      "
    `);
  });

  it('escapes XML-significant characters in an emitted testcase', () => {
    const withQuotes: RuleWithScenarios = {
      sysreq: rule('quoting-rule', {
        title: 'A & B',
        feature: 'f',
        userReqs: ['u'],
        links: [],
      }),
      scenarios: [
        scenarioInput('quoting-scenario', {
          title: `"quoted" & <tagged>`,
          systemRequirement: 'quoting-rule',
          then: ['it works'],
        }),
      ],
    };
    const [file] = junitEmitter.emit([withQuotes]);
    expect(file?.content).toContain('name="A &amp; B"');
    expect(file?.content).toContain('value="&quot;quoted&quot; &amp; &lt;tagged&gt;"');
  });
});
