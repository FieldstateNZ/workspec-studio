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
  const schema = buildJsonSchema(
    DecisionArtifact,
    DECISION_SCHEMA_URL,
    'WorkSpec Decision (v1alpha1)',
  ) as JsonSchema;
  const properties = schema.properties as Record<string, JsonSchema>;
  const metadata = properties.metadata as JsonSchema;
  const metadataProperties = metadata.properties as Record<string, JsonSchema>;
  const spec = properties.spec as JsonSchema;
  const fields = spec.properties as Record<string, JsonSchema>;

  schema.description = 'A repository-native record of an architectural or technical decision.';
  properties.apiVersion = {
    ...properties.apiVersion,
    description: 'Artifact API version discriminant.',
  };
  properties.kind = { ...properties.kind, description: 'Artifact kind discriminant.' };
  metadata.description = 'Common artifact identity.';
  metadataProperties.slug = {
    ...(metadataProperties.slug ?? {}),
    minLength: 1,
    description:
      'Stable filename slug. Optional because repository tooling can derive it from `.workspec/decisions/<slug>.yaml`.',
  };
  spec.description = 'The decision record.';
  const fieldDescriptions: Record<string, string> = {
    title: 'Short human-readable title for the decision.',
    status: 'Lifecycle state of the decision record.',
    deciders: 'People or groups accountable for the decision.',
    context: 'The circumstances, problem, and constraints that made a decision necessary.',
    decision: 'The proposed or recorded decision.',
    rationale: 'Why this decision was selected.',
    consequences: 'Expected consequences of the decision.',
    alternatives: 'Other approaches considered while making the decision.',
    supersedes: 'Bare slug of the earlier decision this record supersedes.',
    references:
      'Supporting repository files, issues, evidence, RFCs, and external resources that are not traversable WorkSpec artifact relationships.',
    tags: 'Free-form labels used to organise and discover decisions.',
  };
  for (const [field, description] of Object.entries(fieldDescriptions)) {
    fields[field] = { ...(fields[field] ?? {}), description };
  }
  fields.supersedes = { ...(fields.supersedes ?? {}), minLength: 1 };
  const alternatives = fields.alternatives as JsonSchema;
  const alternativeItems = alternatives.items as JsonSchema;
  const alternativeFields = alternativeItems.properties as Record<string, JsonSchema>;
  alternativeFields.title = {
    ...alternativeFields.title,
    description: 'Name of an alternative that was considered.',
  };
  alternativeFields.reason = {
    ...alternativeFields.reason,
    description: 'Why the alternative was not selected.',
  };
  const references = fields.references as JsonSchema;
  const referenceItems = references.items as JsonSchema;
  const referenceFields = referenceItems.properties as Record<string, JsonSchema>;
  referenceFields.kind = {
    ...referenceFields.kind,
    description: 'Type of supporting material, such as `issue`, `evidence`, `rfc`, or `spike`.',
  };
  referenceFields.target = {
    ...referenceFields.target,
    description: 'A repository-relative path, absolute URL, or opaque external reference.',
  };
  referenceFields.label = {
    ...referenceFields.label,
    description: 'Optional human-readable label for the reference.',
  };
  for (const field of ['created', 'decided']) {
    fields[field] = {
      ...(fields[field] ?? {}),
      format: 'date',
      description:
        `Date the decision ${field === 'created' ? 'record was created' : 'was accepted or rejected'}, ` +
        'in quoted ISO 8601 full-date form (`YYYY-MM-DD`). Quote the value in YAML so parsers do not coerce it to a date object.',
    };
  }
  for (const field of ['deciders', 'tags']) {
    fields[field] = { ...(fields[field] ?? {}), uniqueItems: true };
  }
  fields.links = {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        cardinality: {
          type: 'object',
          properties: {
            from: {
              type: 'string',
              enum: ['0..1', '1', '1..1', '0..*', '1..*'],
              description: 'Multiplicity at the source end.',
            },
            to: {
              type: 'string',
              enum: ['0..1', '1', '1..1', '0..*', '1..*'],
              description: 'Multiplicity at the target end.',
            },
            label: {
              type: 'string',
              minLength: 1,
              description: 'Optional human-readable relationship label.',
            },
          },
          required: ['from', 'to'],
          additionalProperties: false,
        },
      },
      propertyNames: {
        type: 'string',
        minLength: 1,
        description: 'The link type, or `cardinality` for the optional relationship multiplicity.',
      },
      additionalProperties: {
        type: 'string',
        pattern: '^(~/|@workspace/)',
        description:
          'A WorkSpec-tree (`~/`) or published-workspace (`@workspace/`) path reference.',
      },
      if: { required: ['cardinality'] },
      then: { minProperties: 2, maxProperties: 2 },
      else: { minProperties: 1, maxProperties: 1 },
    },
    description:
      'Traversable relationships to WorkSpec artifacts: exactly one `{<linkType>: <pathRef>}` pair per entry, plus optional cardinality. Path refs must start with `~/` or `@workspace/`.',
  };
  return schema;
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
