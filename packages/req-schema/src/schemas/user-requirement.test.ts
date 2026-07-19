import { describe, expect, it } from 'vitest';
import { API_VERSION } from '@workspec/schema-core';
import { UserRequirementArtifact, UserRequirementSpec } from './user-requirement.js';

function specFactory(overrides: Partial<UserRequirementSpec> = {}): UserRequirementSpec {
  return {
    title: 'Author an element without leaving the canvas',
    actor: 'dev-lead',
    as: 'a dev lead',
    want: 'to author a new element inline on the canvas',
    so: "that I don't break flow switching to a form",
    features: ['element-authoring'],
    status: 'agreed',
    ...overrides,
  };
}

describe('UserRequirementSpec', () => {
  it('accepts the §4.3 example (links omitted)', () => {
    expect(UserRequirementSpec.safeParse(specFactory()).success).toBe(true);
  });

  it('accepts a cross-layer link expressed as a shared pathRef', () => {
    const result = UserRequirementSpec.safeParse(
      specFactory({ links: [{ need: '@workspace/needs/frictionless-authoring' }] }),
    );
    expect(result.success).toBe(true);
  });

  it('rejects a bare-string (non-pathRef) link', () => {
    const result = UserRequirementSpec.safeParse(
      specFactory({ links: [{ need: 'frictionless-authoring' }] }),
    );
    expect(result.success).toBe(false);
  });

  it('rejects a missing title', () => {
    const { title: _title, ...rest } = specFactory();
    expect(UserRequirementSpec.safeParse(rest).success).toBe(false);
  });

  it('rejects an invalid actor slug', () => {
    const result = UserRequirementSpec.safeParse(specFactory({ actor: 'Dev Lead' }));
    expect(result.success).toBe(false);
    expect(result.success === false && result.error.issues[0]?.path).toEqual(['actor']);
  });

  it('rejects an empty features list', () => {
    const result = UserRequirementSpec.safeParse(specFactory({ features: [] }));
    expect(result.success).toBe(false);
  });

  it('rejects a status outside the enum', () => {
    const result = UserRequirementSpec.safeParse(
      specFactory({ status: 'wip' as UserRequirementSpec['status'] }),
    );
    expect(result.success).toBe(false);
    expect(result.success === false && result.error.issues[0]?.path).toEqual(['status']);
  });

  it('rejects an empty want clause', () => {
    expect(UserRequirementSpec.safeParse(specFactory({ want: '' })).success).toBe(false);
  });
});

describe('UserRequirementArtifact', () => {
  it('validates the full envelope from docs/traceability/spec.md §4.3', () => {
    const result = UserRequirementArtifact.safeParse({
      apiVersion: API_VERSION,
      kind: 'UserRequirement',
      metadata: { slug: 'authoring-flow' },
      spec: specFactory(),
    });
    expect(result.success).toBe(true);
  });

  it('rejects the wrong kind literal', () => {
    const result = UserRequirementArtifact.safeParse({
      apiVersion: API_VERSION,
      kind: 'SystemRequirement',
      metadata: { slug: 'authoring-flow' },
      spec: specFactory(),
    });
    expect(result.success).toBe(false);
  });
});
