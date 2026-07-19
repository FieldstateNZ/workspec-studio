import { describe, expect, it } from 'vitest';
import {
  ARTIFACT_KINDS,
  ActorArtifact,
  FEATURE_SCHEMA_URL,
  FeatureArtifact,
  REQ_SCHEMA_PACKAGE,
  SCENARIO_SCHEMA_URL,
  ScenarioArtifact,
  SYSTEM_REQUIREMENT_SCHEMA_URL,
  SystemRequirementArtifact,
  TestRun,
  TYPE_DIRECTORIES,
  USER_REQUIREMENT_SCHEMA_URL,
  UserRequirementArtifact,
  buildAllJsonSchemas,
  typeDirectoryFor,
} from './index.js';

describe('@workspec/req-schema public API', () => {
  it('exports its package identity', () => {
    expect(REQ_SCHEMA_PACKAGE).toBe('@workspec/req-schema');
  });

  it('exports all five artifact kinds and the TestRun shape as parseable schemas', () => {
    for (const schema of [
      ActorArtifact,
      FeatureArtifact,
      UserRequirementArtifact,
      SystemRequirementArtifact,
      ScenarioArtifact,
      TestRun,
    ]) {
      expect(typeof schema.safeParse).toBe('function');
    }
  });

  it('publishes the four flat JSON Schema $id URLs', () => {
    expect(FEATURE_SCHEMA_URL).toBe('https://schema.workspec.io/v1alpha1/feature.schema.json');
    expect(USER_REQUIREMENT_SCHEMA_URL).toBe(
      'https://schema.workspec.io/v1alpha1/user-requirement.schema.json',
    );
    expect(SYSTEM_REQUIREMENT_SCHEMA_URL).toBe(
      'https://schema.workspec.io/v1alpha1/system-requirement.schema.json',
    );
    expect(SCENARIO_SCHEMA_URL).toBe('https://schema.workspec.io/v1alpha1/scenario.schema.json');
  });

  it('exposes the kind list, type directories, and the schema build helper', () => {
    expect(ARTIFACT_KINDS).toEqual(['Feature', 'UserRequirement', 'SystemRequirement', 'Scenario']);
    expect(Object.keys(TYPE_DIRECTORIES)).toHaveLength(4);
    expect(typeDirectoryFor('Feature')).toBe('.workspec/features');
    expect(typeDirectoryFor('Scenario')).toBe('.workspec/scenarios');
    expect(Object.keys(buildAllJsonSchemas()).sort()).toEqual([
      'feature.schema.json',
      'scenario.schema.json',
      'system-requirement.schema.json',
      'user-requirement.schema.json',
    ]);
  });
});
