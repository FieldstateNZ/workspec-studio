import { describe, expect, it } from 'vitest';
import type { SystemRequirement } from '@workspec/req-schema';
import { renderFeatureFile, stripLeadingConjunction } from './gherkin.js';
import type { SysReqInput } from './types.js';

function sysReqInput(slug: string, spec: SystemRequirement['spec']): SysReqInput {
  return {
    slug,
    sysreq: {
      apiVersion: 'workspec.io/v1alpha1',
      kind: 'SystemRequirement',
      metadata: { slug },
      spec,
    },
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
  it('renders a plain Scenario: first step keyword-mapped, continuations → And', () => {
    const file = renderFeatureFile(
      sysReqInput('inline-create-persists', {
        title: 'Creating an element inline saves it immediately',
        feature: 'element-authoring',
        userReqs: ['authoring-flow'],
        given: ['a canvas with no selected element'],
        when: ['the dev lead double-clicks empty canvas', 'and types a name and presses Enter'],
        then: ['the element is persisted', 'and appears in the repo tree without a form submit'],
      }),
    );
    expect(file).toMatchInlineSnapshot(`
      "Feature: element-authoring

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
    const file = renderFeatureFile(
      sysReqInput('inline-create-each-kind', {
        title: 'Inline create works for each element kind',
        feature: 'element-authoring',
        userReqs: ['authoring-flow'],
        given: ['a canvas'],
        when: ['the dev lead inline-creates a "<kind>"'],
        then: ['a valid "<kind>" artifact is written'],
        examples: [{ kind: 'component' }, { kind: 'container' }, { kind: 'database' }],
      }),
    );
    expect(file).toMatchInlineSnapshot(`
      "Feature: element-authoring

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

  it('omits absent given/when blocks (then is always present)', () => {
    const file = renderFeatureFile(
      sysReqInput('then-only', {
        title: 'A scenario with only an assertion',
        feature: 'reporting',
        userReqs: ['some-req'],
        then: ['the report is generated'],
      }),
    );
    expect(file).toMatchInlineSnapshot(`
      "Feature: reporting

        @then-only
        Scenario: A scenario with only an assertion
          Then the report is generated
      "
    `);
  });

  it('ends with exactly one trailing newline', () => {
    const file = renderFeatureFile(
      sysReqInput('trailing', {
        title: 'Trailing newline',
        feature: 'f',
        userReqs: ['u'],
        then: ['it works'],
      }),
    );
    expect(file.endsWith('\n')).toBe(true);
    expect(file.endsWith('\n\n')).toBe(false);
  });
});
