import { describe, expect, it } from 'vitest';
import { API_VERSION } from '@workspec/schema-core';
import { SystemRequirementArtifact, SystemRequirementSpec } from './system-requirement.js';

function specFactory(overrides: Partial<SystemRequirementSpec> = {}): SystemRequirementSpec {
  return {
    title: 'Creating an element inline saves it immediately',
    feature: 'element-authoring',
    userReqs: ['authoring-flow'],
    given: ['a canvas with no selected element'],
    when: ['the dev lead double-clicks empty canvas', 'and types a name and presses Enter'],
    then: ['the element is persisted', 'and appears in the repo tree without a form submit'],
    ...overrides,
  };
}

describe('SystemRequirementSpec', () => {
  it('accepts the §4.4 example', () => {
    expect(SystemRequirementSpec.safeParse(specFactory()).success).toBe(true);
  });

  it('accepts given/when omitted (only then is required)', () => {
    const result = SystemRequirementSpec.safeParse({
      title: 'A minimal scenario',
      feature: 'element-authoring',
      userReqs: ['authoring-flow'],
      then: ['something is asserted'],
    });
    expect(result.success).toBe(true);
  });

  it('accepts an examples table (Scenario Outline) with mixed scalar values', () => {
    const result = SystemRequirementSpec.safeParse(
      specFactory({
        when: ['the dev lead inline-creates a "<kind>"'],
        then: ['a valid "<kind>" artifact is written'],
        examples: [{ kind: 'component' }, { kind: 'container', count: 2, primary: true }],
      }),
    );
    expect(result.success).toBe(true);
  });

  it('rejects a missing then', () => {
    const { then: _then, ...rest } = specFactory();
    const result = SystemRequirementSpec.safeParse(rest);
    expect(result.success).toBe(false);
    expect(result.success === false && result.error.issues[0]?.path).toEqual(['then']);
  });

  it('rejects an empty then array (a scenario with no assertion is meaningless)', () => {
    const result = SystemRequirementSpec.safeParse(specFactory({ then: [] }));
    expect(result.success).toBe(false);
    expect(result.success === false && result.error.issues[0]?.path).toEqual(['then']);
  });

  it('rejects an invalid feature slug', () => {
    const result = SystemRequirementSpec.safeParse(specFactory({ feature: 'Element Authoring' }));
    expect(result.success).toBe(false);
  });

  it('rejects an empty userReqs list', () => {
    expect(SystemRequirementSpec.safeParse(specFactory({ userReqs: [] })).success).toBe(false);
  });

  it('strips a stray nested scenarios[] key (the file IS the scenario; no nesting is modelled)', () => {
    const result = SystemRequirementSpec.safeParse({
      ...specFactory(),
      scenarios: [{ then: ['nested assertion'] }],
    });
    expect(result.success).toBe(true);
    expect(result.success && 'scenarios' in result.data).toBe(false);
  });
});

describe('SystemRequirementArtifact', () => {
  it('validates the full envelope from docs/traceability/spec.md §4.4', () => {
    const result = SystemRequirementArtifact.safeParse({
      apiVersion: API_VERSION,
      kind: 'SystemRequirement',
      metadata: { slug: 'inline-create-persists' },
      spec: specFactory(),
    });
    expect(result.success).toBe(true);
  });

  it('rejects the wrong kind literal', () => {
    const result = SystemRequirementArtifact.safeParse({
      apiVersion: API_VERSION,
      kind: 'UserRequirement',
      metadata: { slug: 'inline-create-persists' },
      spec: specFactory(),
    });
    expect(result.success).toBe(false);
  });
});
