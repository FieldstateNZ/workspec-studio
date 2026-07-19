import { buildJsonSchema, serializeJsonSchema } from '@workspec/schema-core';
import { InventoryArtifact } from './inventory.js';
import { SpendArtifact } from './spend.js';
import { AttributionArtifact } from './attribution.js';
import { TagPlanArtifact } from './tagplan.js';
import {
  INVENTORY_SCHEMA_URL,
  SPEND_SCHEMA_URL,
  ATTRIBUTION_SCHEMA_URL,
  TAGPLAN_SCHEMA_URL,
} from './constants.js';

// Generate JSON Schema (draft 2020-12) from the Zod definitions, via
// `@workspec/schema-core`'s `buildJsonSchema` — the zod4-native `z.toJSONSchema`
// wrapped with the `$schema`/`$id`/`title` stamping and byte-stable key
// sorting every schema-core-based family (this package, req-schema) shares.
// The same builders feed both the `gen:schema` script (which commits the
// files) and the drift test (which regenerates in-memory and asserts
// equality). Output must be deterministic run-to-run.

type JsonSchema = Record<string, unknown>;

/** Build the JSON Schema for `*.inventory.yaml` artifacts. */
export function buildInventoryJsonSchema(): JsonSchema {
  return buildJsonSchema(
    InventoryArtifact,
    INVENTORY_SCHEMA_URL,
    'WorkSpec Inventory (v1alpha1)',
  ) as JsonSchema;
}

/** Build the JSON Schema for `*.spend.yaml` artifacts. */
export function buildSpendJsonSchema(): JsonSchema {
  return buildJsonSchema(
    SpendArtifact,
    SPEND_SCHEMA_URL,
    'WorkSpec Spend (v1alpha1)',
  ) as JsonSchema;
}

/** Build the JSON Schema for `*.attribution.yaml` artifacts. */
export function buildAttributionJsonSchema(): JsonSchema {
  return buildJsonSchema(
    AttributionArtifact,
    ATTRIBUTION_SCHEMA_URL,
    'WorkSpec Attribution (v1alpha1)',
  ) as JsonSchema;
}

/** Build the JSON Schema for `*.tagplan.yaml` artifacts. */
export function buildTagPlanJsonSchema(): JsonSchema {
  return buildJsonSchema(
    TagPlanArtifact,
    TAGPLAN_SCHEMA_URL,
    'WorkSpec TagPlan (v1alpha1)',
  ) as JsonSchema;
}

/** Build all four artifact schemas keyed by their committed filename. */
export function buildAllJsonSchemas(): Record<string, JsonSchema> {
  return {
    'inventory.schema.json': buildInventoryJsonSchema(),
    'spend.schema.json': buildSpendJsonSchema(),
    'attribution.schema.json': buildAttributionJsonSchema(),
    'tagplan.schema.json': buildTagPlanJsonSchema(),
  };
}

/** Canonical serialization used by both the generator and the drift test. */
export { serializeJsonSchema };
