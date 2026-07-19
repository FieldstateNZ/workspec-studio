import { describe, expect, it } from 'vitest';
import { API_VERSION } from '@workspec/schema-core';
import { ScenarioArtifact, ScenarioSpec } from './scenario.js';

function specFactory(overrides: Partial<ScenarioSpec> = {}): ScenarioSpec {
  return {
    title: 'Creating an element inline saves it immediately',
    systemRequirement: 'inline-create',
    given: ['a canvas with no selected element'],
    when: ['the dev lead double-clicks empty canvas', 'and types a name and presses Enter'],
    then: ['the element is persisted', 'and appears in the repo tree without a form submit'],
    ...overrides,
  };
}

describe('ScenarioSpec', () => {
  it('accepts the §4.5 inline-create-persists example', () => {
    expect(ScenarioSpec.safeParse(specFactory()).success).toBe(true);
  });

  it('accepts given/when omitted (only then is required)', () => {
    const result = ScenarioSpec.safeParse({
      title: 'A minimal scenario',
      systemRequirement: 'inline-create',
      then: ['something is asserted'],
    });
    expect(result.success).toBe(true);
  });

  it('accepts an examples table (Scenario Outline) with mixed scalar values', () => {
    const result = ScenarioSpec.safeParse(
      specFactory({
        when: ['the dev lead inline-creates a "<kind>"'],
        then: ['a valid "<kind>" artifact is written'],
        examples: [{ kind: 'component' }, { kind: 'container', count: 2, primary: true }],
      }),
    );
    expect(result.success).toBe(true);
  });

  it('rejects a missing title', () => {
    const { title: _title, ...rest } = specFactory();
    const result = ScenarioSpec.safeParse(rest);
    expect(result.success).toBe(false);
    expect(result.success === false && result.error.issues[0]?.path).toEqual(['title']);
  });

  it('rejects a missing systemRequirement', () => {
    const { systemRequirement: _systemRequirement, ...rest } = specFactory();
    const result = ScenarioSpec.safeParse(rest);
    expect(result.success).toBe(false);
    expect(result.success === false && result.error.issues[0]?.path).toEqual(['systemRequirement']);
  });

  it('rejects an invalid systemRequirement slug', () => {
    const result = ScenarioSpec.safeParse(specFactory({ systemRequirement: 'Inline Create' }));
    expect(result.success).toBe(false);
    expect(result.success === false && result.error.issues[0]?.path).toEqual(['systemRequirement']);
  });

  it('rejects a missing then', () => {
    const { then: _then, ...rest } = specFactory();
    const result = ScenarioSpec.safeParse(rest);
    expect(result.success).toBe(false);
    expect(result.success === false && result.error.issues[0]?.path).toEqual(['then']);
  });

  it('rejects an empty then array (a scenario with no assertion is meaningless)', () => {
    const result = ScenarioSpec.safeParse(specFactory({ then: [] }));
    expect(result.success).toBe(false);
    expect(result.success === false && result.error.issues[0]?.path).toEqual(['then']);
  });
});

describe('ScenarioArtifact', () => {
  it('validates the full envelope from docs/traceability/spec.md §4.5', () => {
    const result = ScenarioArtifact.safeParse({
      apiVersion: API_VERSION,
      kind: 'Scenario',
      metadata: { slug: 'inline-create-persists' },
      spec: specFactory(),
    });
    expect(result.success).toBe(true);
  });

  it('rejects the wrong kind literal', () => {
    const result = ScenarioArtifact.safeParse({
      apiVersion: API_VERSION,
      kind: 'SystemRequirement',
      metadata: { slug: 'inline-create-persists' },
      spec: specFactory(),
    });
    expect(result.success).toBe(false);
  });
});
