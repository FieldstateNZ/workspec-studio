import { describe, expect, it } from 'vitest';
import type { Scenario, SystemRequirement } from '@workspec/req-schema';
import { renderFeatureFile, stripLeadingConjunction } from './gherkin.js';
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

describe('stripLeadingConjunction', () => {
  it('strips a leading "and "/"but " (case-insensitive)', () => {
    expect(stripLeadingConjunction('and types a name')).toBe('types a name');
    expect(stripLeadingConjunction('But nothing happens')).toBe('nothing happens');
    expect(stripLeadingConjunction('AND it persists')).toBe('it persists');
  });

  it('leaves internal or non-conjunction text untouched', () => {
    expect(stripLeadingConjunction('the element is persisted')).toBe('the element is persisted');
    // "android" starts with "and" but is not the whole conjunction word.
    expect(stripLeadingConjunction('android saves it')).toBe('android saves it');
  });

  it('keeps the original when stripping would leave it empty', () => {
    expect(stripLeadingConjunction('and ')).toBe('and ');
  });
});

describe('renderFeatureFile', () => {
  it('renders Feature > Rule > one plain Scenario: first step keyword-mapped, continuations → And', () => {
    const file = renderFeatureFile({
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
      ],
    });
    expect(file).toMatchInlineSnapshot(`
      "Feature: element-authoring

        Rule: Inline element creation

          @inline-create-persists
          Scenario: Creating an element inline saves it immediately
            Given a canvas with no selected element
            When the dev lead double-clicks empty canvas
            And types a name and presses Enter
            Then the element is persisted
            And appears in the repo tree without a form submit
      "
    `);
  });

  it('renders a Scenario Outline with an aligned Examples table when examples are present', () => {
    const file = renderFeatureFile({
      sysreq: rule('inline-create', {
        title: 'Inline element creation',
        feature: 'element-authoring',
        userReqs: ['authoring-flow'],
        links: [],
      }),
      scenarios: [
        scenarioInput('inline-create-each-kind', {
          title: 'Inline create works for each element kind',
          systemRequirement: 'inline-create',
          given: ['a canvas'],
          when: ['the dev lead inline-creates a "<kind>"'],
          then: ['a valid "<kind>" artifact is written'],
          examples: [{ kind: 'component' }, { kind: 'container' }, { kind: 'database' }],
        }),
      ],
    });
    expect(file).toMatchInlineSnapshot(`
      "Feature: element-authoring

        Rule: Inline element creation

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

  it('renders multiple scenarios under one Rule, separated by a blank line (rule-groups-scenarios)', () => {
    const file = renderFeatureFile({
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
          then: ['the element is persisted'],
        }),
        scenarioInput('inline-create-each-kind', {
          title: 'Inline create works for each element kind',
          systemRequirement: 'inline-create',
          then: ['a valid artifact is written'],
        }),
      ],
    });
    expect(file).toMatchInlineSnapshot(`
      "Feature: element-authoring

        Rule: Inline element creation

          @inline-create-persists
          Scenario: Creating an element inline saves it immediately
            Then the element is persisted

          @inline-create-each-kind
          Scenario: Inline create works for each element kind
            Then a valid artifact is written
      "
    `);
  });

  it('omits absent given/when blocks (then is always present)', () => {
    const file = renderFeatureFile({
      sysreq: rule('reporting-rule', {
        title: 'A rule with a then-only scenario',
        feature: 'reporting',
        userReqs: ['some-req'],
        links: [],
      }),
      scenarios: [
        scenarioInput('then-only', {
          title: 'A scenario with only an assertion',
          systemRequirement: 'reporting-rule',
          then: ['the report is generated'],
        }),
      ],
    });
    expect(file).toMatchInlineSnapshot(`
      "Feature: reporting

        Rule: A rule with a then-only scenario

          @then-only
          Scenario: A scenario with only an assertion
            Then the report is generated
      "
    `);
  });

  it('renders just the Feature/Rule header for an empty rule (no scenarios, spec §4.7)', () => {
    const file = renderFeatureFile({
      sysreq: rule('empty-rule', {
        title: 'A rule with no scenarios yet',
        feature: 'element-authoring',
        userReqs: ['authoring-flow'],
        links: [],
      }),
      scenarios: [],
    });
    expect(file).toMatchInlineSnapshot(`
      "Feature: element-authoring

        Rule: A rule with no scenarios yet
      "
    `);
    expect(file.endsWith('\n')).toBe(true);
    expect(file.endsWith('\n\n')).toBe(false);
  });

  it('ends with exactly one trailing newline', () => {
    const file = renderFeatureFile({
      sysreq: rule('trailing-rule', {
        title: 'Trailing',
        feature: 'f',
        userReqs: ['u'],
        links: [],
      }),
      scenarios: [
        scenarioInput('trailing', {
          title: 'Trailing newline',
          systemRequirement: 'trailing-rule',
          then: ['it works'],
        }),
      ],
    });
    expect(file.endsWith('\n')).toBe(true);
    expect(file.endsWith('\n\n')).toBe(false);
  });
});
