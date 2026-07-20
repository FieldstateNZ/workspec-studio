import { z } from 'zod';
import { CatalogArtifact } from './catalog.js';
import { DecisionArtifact } from './decision.js';
import { CATALOG_SCHEMA_URL, DECISION_SCHEMA_URL, JSON_SCHEMA_DIALECT } from './constants.js';

// Generate JSON Schema (draft 2020-12) from the Zod definitions via zod 4's
// native `z.toJSONSchema`. `@workspec/decision-schema` does not depend on
// `@workspec/schema-core`, so this file carries its own copy of the
// stamp-then-sort logic every schema-core-based family (`@workspec/cost-schema`,
// `@workspec/req-schema`) shares via `buildJsonSchema`/`sortJsonKeys` — same
// shape, independent implementation. The same builders feed both the
// `gen:schema` script (which commits the files) and the drift test (which
// regenerates in-memory and asserts equality). Output must be deterministic
// run-to-run.

type JsonSchema = Record<string, unknown>;

/**
 * Recursively sorts object keys (alphabetically) throughout a JSON value,
 * leaving array order untouched. `z.toJSONSchema`'s own key order already
 * tends to follow schema definition order, but this makes the committed
 * output byte-stable across Zod versions and regenerations regardless.
 * Same implementation as `@workspec/schema-core`'s `sortJsonKeys`.
 */
function sortJsonKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonKeys);
  }
  if (value !== null && typeof value === 'object') {
    const sortedEntries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entryValue]) => [key, sortJsonKeys(entryValue)] as const);
    return Object.fromEntries(sortedEntries);
  }
  return value;
}

/**
 * Converts a Zod schema to a draft 2020-12 JSON Schema document, stamping on
 * the `$id` and `title` every committed schema carries, and sorting keys for
 * byte-stable regeneration.
 *
 * Uses `io: 'input'` because the committed schemas describe what authors
 * *write*: fields with a Zod `.default(...)` (e.g. `Lever.enabled`) must not
 * be marked `required` in the editor-facing schema. `reused: 'inline'` is
 * passed explicitly for clarity — it is also zod 4's own default (verified
 * against the installed `zod@4.4.3` types) — so every reused sub-schema is
 * inlined rather than hoisted into `$defs`/`$ref`, matching the fully
 * inlined shape the previous `zod-to-json-schema` (`$refStrategy: 'none'`)
 * configuration produced.
 */
function decorate(schema: z.ZodType, $id: string, title: string): JsonSchema {
  const body = z.toJSONSchema(schema, {
    target: 'draft-2020-12',
    io: 'input',
    reused: 'inline',
  }) as JsonSchema;
  // We set our own dialect + $id; drop any $schema the generator emitted so
  // the key order (and value) is stable and under our control.
  delete body.$schema;
  return sortJsonKeys({
    $schema: JSON_SCHEMA_DIALECT,
    $id,
    title,
    ...body,
  }) as JsonSchema;
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
