// @workspec/req-schema — the Zod source of truth for WorkSpec Traceability
// Workbench requirement artifacts. Five file-native kinds, one import:
//
//   • Actor            — owned by @workspec/schema-core, re-exported here so
//                        consumers get all five kinds from one package.
//   • Feature          — a thin grouping container.
//   • UserRequirement  — the user-story promise the RTM traces.
//   • SystemRequirement — a Gherkin Rule: groups scenarios, verifies
//                        userReqs, carries no steps of its own.
//   • Scenario         — the executed unit: ONE Gherkin scenario per file
//                        (slug = scenario name = identity), referencing its
//                        parent Rule via `systemRequirement`.
//
// Each is a K8s-style envelope (apiVersion/kind/metadata/spec) validating a
// `.workspec/<dir>/<slug>.yaml` file, built on schema-core's `defineArtifact`.
// Plus the ingested `TestRun` evidence shape (spec §4.6, keyed on the
// scenario slug) and the JSON Schema generation machinery. See
// docs/traceability/spec.md §4.

/**
 * This package's own identity. Every other `@workspec/trace-*` package depends
 * on this one, directly or transitively — never the reverse.
 */
export const REQ_SCHEMA_PACKAGE = '@workspec/req-schema' as const;

// ── URL and directive constants ──────────────────────────────────────────────
export {
  FEATURE_SCHEMA_URL,
  USER_REQUIREMENT_SCHEMA_URL,
  SYSTEM_REQUIREMENT_SCHEMA_URL,
  SCENARIO_SCHEMA_URL,
  FEATURE_SCHEMA_DIRECTIVE,
  USER_REQUIREMENT_SCHEMA_DIRECTIVE,
  SYSTEM_REQUIREMENT_SCHEMA_DIRECTIVE,
  SCENARIO_SCHEMA_DIRECTIVE,
} from './constants.js';

// ── Kind list and type directories (req-schema's own four kinds) ──────────────
export { ARTIFACT_KINDS } from './paths/artifact-kind.js';
export type { ArtifactKind } from './paths/artifact-kind.js';
export { TYPE_DIRECTORIES, typeDirectoryFor } from './paths/type-directories.js';

// ── The shared Actor kind (owned by @workspec/schema-core) ────────────────────
export { ActorSpec, ActorArtifact } from '@workspec/schema-core';
export type { Actor } from '@workspec/schema-core';

// ── Feature ───────────────────────────────────────────────────────────────────
export { FeatureSpec, FeatureArtifact } from './schemas/feature.js';
export type { Feature } from './schemas/feature.js';

// ── UserRequirement ────────────────────────────────────────────────────────────
export { UserRequirementSpec, UserRequirementArtifact } from './schemas/user-requirement.js';
export type { UserRequirement } from './schemas/user-requirement.js';

// ── SystemRequirement (a Gherkin Rule — no steps of its own) ───────────────────
export { SystemRequirementSpec, SystemRequirementArtifact } from './schemas/system-requirement.js';
export type { SystemRequirement } from './schemas/system-requirement.js';

// ── Scenario (the executed unit; fifth kind) ───────────────────────────────────
export { ScenarioSpec, ScenarioArtifact } from './schemas/scenario.js';
export type { Scenario } from './schemas/scenario.js';

// ── Evidence / TestRun (ingested, never authored) ─────────────────────────────
export { TestRun, TestResult } from './schemas/test-run.js';

// ── JSON Schema generation ────────────────────────────────────────────────────
export { buildAllJsonSchemas } from './json-schema/build-all-json-schemas.js';
