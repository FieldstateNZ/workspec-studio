import { describe, expect, it } from 'vitest';
import type { Scenario, SystemRequirement } from '@workspec/req-schema';
import { renderJunitFile } from './junit-render.js';
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

describe('renderJunitFile', () => {
  it('renders a testsuite with tests count and one testcase per scenario', () => {
    const file = renderJunitFile({
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
      ],
    });
    expect(file).toMatchInlineSnapshot(`
      "<?xml version="1.0" encoding="UTF-8"?>
      <testsuite name="Inline element creation" tests="1">
          <testcase classname="inline-create" name="inline-create-persists">
            <properties>
              <property name="title" value="Creating an element inline saves it immediately"/>
            </properties>
          </testcase>
      </testsuite>
      "
    `);
  });

  it('groups multiple scenarios under one testsuite, tests count matching scenario count', () => {
    const file = renderJunitFile({
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
          examples: [{ kind: 'component' }, { kind: 'container' }],
        }),
      ],
    });
    expect(file).toContain('<testsuite name="Inline element creation" tests="2">');
    expect(file.match(/<testcase /g)?.length).toBe(2);
  });

  it('emits exactly ONE testcase for an examples-table scenario (no native outline construct)', () => {
    const file = renderJunitFile({
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
          then: ['a valid artifact is written'],
          examples: [{ kind: 'component' }, { kind: 'container' }, { kind: 'database' }],
        }),
      ],
    });
    expect(file).toContain('tests="1"');
    expect(file.match(/<testcase /g)?.length).toBe(1);
  });

  it('carries the scenario slug verbatim as the testcase name (req-slug-as-testcase-name)', () => {
    const file = renderJunitFile({
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
      ],
    });
    expect(file).toContain('name="inline-create-persists"');
    expect(file).toContain('classname="inline-create"');
  });

  it('escapes XML-significant characters in titles and slugs', () => {
    const file = renderJunitFile({
      sysreq: rule('rule-with-amp', {
        title: 'Rules & "quotes" & <tags>',
        feature: 'f',
        userReqs: ['u'],
        links: [],
      }),
      scenarios: [
        scenarioInput('scenario-with-amp', {
          title: `A "quoted" & 'special' <title>`,
          systemRequirement: 'rule-with-amp',
          then: ['it works'],
        }),
      ],
    });
    expect(file).toContain('Rules &amp; &quot;quotes&quot; &amp; &lt;tags&gt;');
    expect(file).toContain('value="A &quot;quoted&quot; &amp; &apos;special&apos; &lt;title&gt;"');
  });

  it('renders a single self-closing empty testsuite for an empty rule (no scenarios, spec §4.7)', () => {
    const file = renderJunitFile({
      sysreq: rule('empty-rule', {
        title: 'A rule with no scenarios yet',
        feature: 'element-authoring',
        userReqs: ['authoring-flow'],
        links: [],
      }),
      scenarios: [],
    });
    expect(file).toMatchInlineSnapshot(`
      "<?xml version="1.0" encoding="UTF-8"?>
      <testsuite name="A rule with no scenarios yet" tests="0"/>
      "
    `);
    expect(file.endsWith('\n')).toBe(true);
    expect(file.endsWith('\n\n')).toBe(false);
  });

  it('ends with exactly one trailing newline for a non-empty rule', () => {
    const file = renderJunitFile({
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
