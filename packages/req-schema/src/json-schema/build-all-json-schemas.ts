import { buildJsonSchema } from '@workspec/schema-core';
import {
  FEATURE_SCHEMA_URL,
  SCENARIO_SCHEMA_URL,
  SYSTEM_REQUIREMENT_SCHEMA_URL,
  USER_REQUIREMENT_SCHEMA_URL,
} from '../constants.js';
import { FeatureArtifact } from '../schemas/feature.js';
import { ScenarioArtifact } from '../schemas/scenario.js';
import { SystemRequirementArtifact } from '../schemas/system-requirement.js';
import { UserRequirementArtifact } from '../schemas/user-requirement.js';

/**
 * Builds every committed req-schema JSON Schema, keyed by the filename it's
 * written to under `json-schema/`. `scripts/gen-json-schema.ts` writes this
 * map to disk; the drift test regenerates it in-memory and asserts
 * byte-equality with what's committed.
 *
 * Each entry validates the *full envelope* (`apiVersion`/`kind`/`metadata`/
 * `spec`), not just the spec body — that's what a `.workspec/<kind-dir>/
 * <slug>.yaml` file actually contains on disk. The shared `Actor` kind's
 * schema is NOT regenerated here: `@workspec/schema-core` owns and publishes
 * `actor.schema.json`.
 */
export function buildAllJsonSchemas(): Record<string, unknown> {
  return {
    'feature.schema.json': buildJsonSchema(
      FeatureArtifact,
      FEATURE_SCHEMA_URL,
      'WorkSpec Feature (v1alpha1)',
    ),
    'user-requirement.schema.json': buildJsonSchema(
      UserRequirementArtifact,
      USER_REQUIREMENT_SCHEMA_URL,
      'WorkSpec User Requirement (v1alpha1)',
    ),
    'system-requirement.schema.json': buildJsonSchema(
      SystemRequirementArtifact,
      SYSTEM_REQUIREMENT_SCHEMA_URL,
      'WorkSpec System Requirement (v1alpha1)',
    ),
    'scenario.schema.json': buildJsonSchema(
      ScenarioArtifact,
      SCENARIO_SCHEMA_URL,
      'WorkSpec Scenario (v1alpha1)',
    ),
  };
}
