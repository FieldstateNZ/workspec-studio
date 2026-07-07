import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ZodTypeAny } from 'zod';
import { CatalogArtifact } from './catalog.js';
import { DecisionArtifact } from './decision.js';
import { CATALOG_SCHEMA_URL, DECISION_SCHEMA_URL, JSON_SCHEMA_DIALECT } from './constants.js';

// Generate JSON Schema (draft 2020-12) from the Zod definitions. The same
// builders feed both the `gen:schema` script (which commits the files) and the
// drift test (which regenerates in-memory and asserts equality). Output must be
// deterministic run-to-run.

type JsonSchema = Record<string, unknown>;

function decorate(schema: ZodTypeAny, $id: string, title: string): JsonSchema {
  // The generator's newest target is 2019-09. With `$refStrategy: 'none'`
  // everything is inlined (no `$defs`/`definitions`), and the constructs we
  // emit — objects, arrays, records, enums, discriminated unions — are
  // identical across draft 2019-09 and 2020-12, so we declare the 2020-12
  // dialect via `$schema` above.
  const body = zodToJsonSchema(schema, {
    target: 'jsonSchema2019-09',
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

/** Build the JSON Schema for `*.decision.yaml` artifacts. */
export function buildDecisionJsonSchema(): JsonSchema {
  return decorate(DecisionArtifact, DECISION_SCHEMA_URL, 'WorkSpec Decision (v1alpha1)');
}

/** Build the JSON Schema for `*.catalog.yaml` artifacts. */
export function buildCatalogJsonSchema(): JsonSchema {
  return decorate(CatalogArtifact, CATALOG_SCHEMA_URL, 'WorkSpec Catalog (v1alpha1)');
}

/** Build both artifact schemas keyed by their committed filename. */
export function buildAllJsonSchemas(): Record<string, JsonSchema> {
  return {
    'decision.schema.json': buildDecisionJsonSchema(),
    'catalog.schema.json': buildCatalogJsonSchema(),
  };
}

/** Canonical serialization used by both the generator and the drift test. */
export function serializeJsonSchema(schema: JsonSchema): string {
  return `${JSON.stringify(schema, null, 2)}\n`;
}
