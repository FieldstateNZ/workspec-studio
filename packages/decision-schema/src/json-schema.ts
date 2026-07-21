import { buildJsonSchema, serializeJsonSchema } from '@workspec/schema-core';
import { CatalogArtifact } from './catalog.js';
import { DecisionArtifact } from './decision.js';
import { CATALOG_SCHEMA_URL, DECISION_SCHEMA_URL } from './constants.js';

// Generate JSON Schema (draft 2020-12) from the Zod definitions, via
// `@workspec/schema-core`'s `buildJsonSchema` — the zod4-native `z.toJSONSchema`
// wrapped with the `$schema`/`$id`/`title` stamping and byte-stable key
// sorting every schema-core-based family (this package, cost-schema,
// req-schema) shares. The same builders feed both the `gen:schema` script
// (which commits the files) and the drift test (which regenerates in-memory
// and asserts equality). Output must be deterministic run-to-run.

type JsonSchema = Record<string, unknown>;

/** Build the JSON Schema for `*.decision.yaml` artifacts. */
export function buildDecisionJsonSchema(): JsonSchema {
  return buildJsonSchema(
    DecisionArtifact,
    DECISION_SCHEMA_URL,
    'WorkSpec Decision (v1alpha1)',
  ) as JsonSchema;
}

/** Build the JSON Schema for `*.catalog.yaml` artifacts. */
export function buildCatalogJsonSchema(): JsonSchema {
  return buildJsonSchema(
    CatalogArtifact,
    CATALOG_SCHEMA_URL,
    'WorkSpec Catalog (v1alpha1)',
  ) as JsonSchema;
}

/** Build both artifact schemas keyed by their committed filename. */
export function buildAllJsonSchemas(): Record<string, JsonSchema> {
  return {
    'decision.schema.json': buildDecisionJsonSchema(),
    'catalog.schema.json': buildCatalogJsonSchema(),
  };
}

/** Canonical serialization used by both the generator and the drift test. */
export { serializeJsonSchema };
