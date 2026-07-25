import { buildJsonSchema, serializeJsonSchema } from '@workspec/schema-core';
import { TopologyArtifact } from './topology.js';
import { ResourceArtifact } from './resource.js';
import { EnvironmentArtifact } from './environment.js';
import { Layout } from './schemas/layout/layout.js';
import {
  ENVIRONMENT_SCHEMA_URL,
  RESOURCE_SCHEMA_URL,
  TOPOLOGY_LAYOUT_SCHEMA_URL,
  TOPOLOGY_SCHEMA_URL,
} from './constants.js';

// Generate JSON Schema (draft 2020-12) from the Zod definitions, via
// `@workspec/schema-core`'s `buildJsonSchema` — the zod4-native `z.toJSONSchema`
// wrapped with the `$schema`/`$id`/`title` stamping and byte-stable key
// sorting every schema-core-based family (this package, decision-schema,
// cost-schema) shares. The same builders feed both the `gen:schema` script
// (which commits the files) and the drift test (which regenerates in-memory
// and asserts equality). Output must be deterministic run-to-run.

type JsonSchema = Record<string, unknown>;

/** Build the JSON Schema for `.workspec/topologies/<slug>.yaml` artifacts. */
export function buildTopologyJsonSchema(): JsonSchema {
  return buildJsonSchema(TopologyArtifact, TOPOLOGY_SCHEMA_URL, 'WorkSpec Topology (v1alpha1)') as JsonSchema;
}

/** Build the JSON Schema for `.workspec/resources/<slug>.yaml` artifacts. */
export function buildResourceJsonSchema(): JsonSchema {
  return buildJsonSchema(ResourceArtifact, RESOURCE_SCHEMA_URL, 'WorkSpec Resource (v1alpha1)') as JsonSchema;
}

/** Build the JSON Schema for `.workspec/environments/<slug>.yaml` artifacts. */
export function buildEnvironmentJsonSchema(): JsonSchema {
  return buildJsonSchema(
    EnvironmentArtifact,
    ENVIRONMENT_SCHEMA_URL,
    'WorkSpec Environment (v1alpha1)',
  ) as JsonSchema;
}

/** Build the JSON Schema for a topology's `.layout/` file. */
export function buildTopologyLayoutJsonSchema(): JsonSchema {
  return buildJsonSchema(
    Layout,
    TOPOLOGY_LAYOUT_SCHEMA_URL,
    'WorkSpec Topology Layout (v1alpha1)',
  ) as JsonSchema;
}

/** Build every artifact schema keyed by their committed filename. */
export function buildAllJsonSchemas(): Record<string, JsonSchema> {
  return {
    'topology.schema.json': buildTopologyJsonSchema(),
    'resource.schema.json': buildResourceJsonSchema(),
    'environment.schema.json': buildEnvironmentJsonSchema(),
    'topology-layout.schema.json': buildTopologyLayoutJsonSchema(),
  };
}

/** Canonical serialization used by both the generator and the drift test. */
export { serializeJsonSchema };
