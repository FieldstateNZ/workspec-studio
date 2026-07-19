import { describe, expect, it } from 'vitest';
import { API_VERSION } from '@workspec/schema-core';
import { SystemRequirementArtifact, SystemRequirementSpec } from './system-requirement.js';

function specFactory(overrides: Partial<SystemRequirementSpec> = {}): SystemRequirementSpec {
  return {
    title: 'Inline element creation',
    feature: 'element-authoring',
    userReqs: ['authoring-flow'],
    ...overrides,
  };
}

describe('SystemRequirementSpec', () => {
  it('accepts the §4.4 example (a Rule: title + feature + userReqs, no steps)', () => {
    expect(SystemRequirementSpec.safeParse(specFactory()).success).toBe(true);
  });

  it('rejects a missing title', () => {
    const { title: _title, ...rest } = specFactory();
    const result = SystemRequirementSpec.safeParse(rest);
    expect(result.success).toBe(false);
    expect(result.success === false && result.error.issues[0]?.path).toEqual(['title']);
  });

  it('rejects an empty title', () => {
    const result = SystemRequirementSpec.safeParse(specFactory({ title: '' }));
    expect(result.success).toBe(false);
    expect(result.success === false && result.error.issues[0]?.path).toEqual(['title']);
  });

  it('rejects a missing feature', () => {
    const { feature: _feature, ...rest } = specFactory();
    const result = SystemRequirementSpec.safeParse(rest);
    expect(result.success).toBe(false);
    expect(result.success === false && result.error.issues[0]?.path).toEqual(['feature']);
  });

  it('rejects an invalid feature slug', () => {
    const result = SystemRequirementSpec.safeParse(specFactory({ feature: 'Element Authoring' }));
    expect(result.success).toBe(false);
  });

  it('rejects a missing userReqs', () => {
    const { userReqs: _userReqs, ...rest } = specFactory();
    const result = SystemRequirementSpec.safeParse(rest);
    expect(result.success).toBe(false);
    expect(result.success === false && result.error.issues[0]?.path).toEqual(['userReqs']);
  });

  it('rejects an empty userReqs list', () => {
    expect(SystemRequirementSpec.safeParse(specFactory({ userReqs: [] })).success).toBe(false);
  });

  it('accepts an optional links entry', () => {
    const result = SystemRequirementSpec.safeParse(
      specFactory({ links: [{ need: '@workspace/needs/frictionless-authoring' }] }),
    );
    expect(result.success).toBe(true);
  });

  it('strips stray given/when/then/examples keys (those moved to Scenario, spec §4.5)', () => {
    const result = SystemRequirementSpec.safeParse({
      ...specFactory(),
      given: ['a canvas'],
      when: ['the dev lead double-clicks'],
      then: ['the element is persisted'],
      examples: [{ kind: 'component' }],
    });
    expect(result.success).toBe(true);
    expect(result.success && 'given' in result.data).toBe(false);
    expect(result.success && 'when' in result.data).toBe(false);
    expect(result.success && 'then' in result.data).toBe(false);
    expect(result.success && 'examples' in result.data).toBe(false);
  });
});

describe('SystemRequirementArtifact', () => {
  it('validates the full envelope from docs/traceability/spec.md §4.4', () => {
    const result = SystemRequirementArtifact.safeParse({
      apiVersion: API_VERSION,
      kind: 'SystemRequirement',
      metadata: { slug: 'inline-create' },
      spec: specFactory(),
    });
    expect(result.success).toBe(true);
  });

  it('rejects the wrong kind literal', () => {
    const result = SystemRequirementArtifact.safeParse({
      apiVersion: API_VERSION,
      kind: 'UserRequirement',
      metadata: { slug: 'inline-create' },
      spec: specFactory(),
    });
    expect(result.success).toBe(false);
  });
});
