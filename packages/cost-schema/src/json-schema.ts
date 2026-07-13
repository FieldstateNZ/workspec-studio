import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ZodTypeAny } from 'zod';
import { InventoryArtifact } from './inventory.js';
import { SpendArtifact } from './spend.js';
import { AttributionArtifact } from './attribution.js';
import { TagPlanArtifact } from './tagplan.js';
import {
  INVENTORY_SCHEMA_URL,
  SPEND_SCHEMA_URL,
  ATTRIBUTION_SCHEMA_URL,
  TAGPLAN_SCHEMA_URL,
  JSON_SCHEMA_DIALECT,
} from './constants.js';

// Generate JSON Schema (draft 2020-12) from the Zod definitions. The same
// builders feed both the `gen:schema` script (which commits the files) and the
// drift test (which regenerates in-memory and asserts equality). Output must be
// deterministic run-to-run.

type JsonSchema = Record<string, unknown>;

function decorate(schema: ZodTypeAny, $id: string, title: string): JsonSchema {
  // Target draft-07, not 2019-09: the 2019-09 target emits draft-04-style
  // boolean `exclusiveMinimum` for `.positive()` (split ratios), which is
  // INVALID under the 2020-12 dialect we declare via `$schema`. The draft-07
  // target emits numeric `exclusiveMinimum`, and every construct we emit —
  // objects, arrays, records, enums, numeric bounds — is valid unchanged
  // under 2020-12. With `$refStrategy: 'none'` everything is inlined (no
  // `$defs`/`definitions`).
  const body = zodToJsonSchema(schema, {
    target: 'jsonSchema7',
    $refStrategy: 'none',
  }) as JsonSchema;
  // We set our own dialect + $id; drop any $schema the generator emitted so the
  // key order (and value) is stable and under our control.
  delete body.$schema;
  return {
    $schema: JSON_SCHEMA_DIALECT,
    $id,
    title,
    ...body,
  };
}

/** Build the JSON Schema for `*.inventory.yaml` artifacts. */
export function buildInventoryJsonSchema(): JsonSchema {
  return decorate(InventoryArtifact, INVENTORY_SCHEMA_URL, 'WorkSpec Inventory (v1alpha1)');
}

/** Build the JSON Schema for `*.spend.yaml` artifacts. */
export function buildSpendJsonSchema(): JsonSchema {
  return decorate(SpendArtifact, SPEND_SCHEMA_URL, 'WorkSpec Spend (v1alpha1)');
}

/** Build the JSON Schema for `*.attribution.yaml` artifacts. */
export function buildAttributionJsonSchema(): JsonSchema {
  return decorate(AttributionArtifact, ATTRIBUTION_SCHEMA_URL, 'WorkSpec Attribution (v1alpha1)');
}

/** Build the JSON Schema for `*.tagplan.yaml` artifacts. */
export function buildTagPlanJsonSchema(): JsonSchema {
  return decorate(TagPlanArtifact, TAGPLAN_SCHEMA_URL, 'WorkSpec TagPlan (v1alpha1)');
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
export function serializeJsonSchema(schema: JsonSchema): string {
  return `${JSON.stringify(schema, null, 2)}\n`;
}
