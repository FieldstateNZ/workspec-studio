import { describe, expect, it } from 'vitest';
import type { Scenario, SystemRequirement } from '@workspec/req-schema';
import { cucumberEmitter } from './cucumber.js';
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
      when: ['the dev lead double-clicks empty canvas', 'and types a name and presses Enter'],
      then: ['the element is persisted', 'and appears in the repo tree without a form submit'],
    }),
    scenarioInput('inline-create-each-kind', {
      title: 'Inline create works for each element kind',
      systemRequirement: 'inline-create',
      given: ['a canvas'],
      when: ['the dev lead inline-creates a "<kind>"'],
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

describe('cucumberEmitter.emit', () => {
  it('emits one .feature file per Rule, named on the Rule slug (feature-file-per-rule)', () => {
    const files = cucumberEmitter.emit([inlineCreate, runReview]);
    expect(files.map((f) => f.path)).toEqual([
      'failing-run-surfaced.feature',
      'inline-create.feature',
    ]);
  });

  it('returns files deterministically sorted by path regardless of input order', () => {
    const a = cucumberEmitter.emit([inlineCreate, runReview]);
    const b = cucumberEmitter.emit([runReview, inlineCreate]);
    expect(a).toEqual(b);
  });

  it('tags each scenario with its OWN @<scenario-slug> (req-tag-on-scenario — the ingest binding)', () => {
    const [file] = cucumberEmitter.emit([inlineCreate]);
    expect(file?.content).toContain('@inline-create-persists\n');
    expect(file?.content).toContain('@inline-create-each-kind\n');
  });

  it('groups multiple scenarios under one Feature/Rule (rule-groups-scenarios)', () => {
    const [file] = cucumberEmitter.emit([inlineCreate]);
    expect(file?.content).toContain('Feature: element-authoring');
    expect(file?.content).toContain('Rule: Inline element creation');
    expect(file?.content?.match(/Scenario/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('uses Scenario Outline only when the scenario has an examples table (outline-from-examples)', () => {
    const [file] = cucumberEmitter.emit([inlineCreate]);
    expect(file?.content).toContain('Scenario: Creating an element inline saves it immediately');
    expect(file?.content).toContain('Scenario Outline: Inline create works for each element kind');
    expect(file?.content).toContain('Examples:');
  });

  it('emits the Feature/Rule header alone for an empty rule (no scenarios)', () => {
    const empty: RuleWithScenarios = {
      sysreq: rule('empty-rule', {
        title: 'A rule with no scenarios yet',
        feature: 'element-authoring',
        userReqs: ['authoring-flow'],
        links: [],
      }),
      scenarios: [],
    };
    const [file] = cucumberEmitter.emit([empty]);
    expect(file?.path).toBe('empty-rule.feature');
    expect(file?.content).toMatchInlineSnapshot(`
      "Feature: element-authoring

        Rule: A rule with no scenarios yet
      "
    `);
  });

  it('byte-stable full output for a Rule with a plain scenario + a scenario outline', () => {
    const [file] = cucumberEmitter.emit([inlineCreate]);
    expect(file?.content).toMatchInlineSnapshot(`
      "Feature: element-authoring

        Rule: Inline element creation

          @inline-create-persists
          Scenario: Creating an element inline saves it immediately
            Given a canvas with no selected element
            When the dev lead double-clicks empty canvas
            And types a name and presses Enter
            Then the element is persisted
            And appears in the repo tree without a form submit

          @inline-create-each-kind
          Scenario Outline: Inline create works for each element kind
            Given a canvas
            When the dev lead inline-creates a "<kind>"
            Then a valid "<kind>" artifact is written

            Examples:
              | kind      |
              | component |
              | container |
              | database  |
      "
    `);
  });
});
