import { SCHEMA_BASE_URL } from './schema-version.js';

/**
 * Builds the canonical `$id` / `$schema` URL for a committed C4 JSON Schema
 * from its bare kind name (e.g. `"actor"` -> `.../c4/actor.schema.json`).
 */
export function schemaUrlFor(name: string): string {
  return `${SCHEMA_BASE_URL}${name}.schema.json`;
}

/** Canonical `$schema` URL for actor element YAML files. */
export const ACTOR_SCHEMA_URL = schemaUrlFor('actor');
/** Canonical `$schema` URL for the singleton system element YAML file. */
export const SYSTEM_SCHEMA_URL = schemaUrlFor('system');
/** Canonical `$schema` URL for external-system element YAML files. */
export const EXTERNAL_SYSTEM_SCHEMA_URL = schemaUrlFor('external-system');
/** Canonical `$schema` URL for container element YAML files. */
export const CONTAINER_SCHEMA_URL = schemaUrlFor('container');
/** Canonical `$schema` URL for component element YAML files. */
export const COMPONENT_SCHEMA_URL = schemaUrlFor('component');
/** Canonical `$schema` URL for database element YAML files. */
export const DATABASE_SCHEMA_URL = schemaUrlFor('database');
/** Canonical `$schema` URL for queue element YAML files. */
export const QUEUE_SCHEMA_URL = schemaUrlFor('queue');
/** Canonical `$schema` URL for domain element YAML files. */
export const DOMAIN_SCHEMA_URL = schemaUrlFor('domain');
/** Canonical `$schema` URL for feature element YAML files. */
export const FEATURE_SCHEMA_URL = schemaUrlFor('feature');
/** Canonical `$schema` URL for diagram YAML files. */
export const DIAGRAM_SCHEMA_URL = schemaUrlFor('diagram');
/** Canonical `$schema` URL for `.layout/` files. */
export const LAYOUT_SCHEMA_URL = schemaUrlFor('layout');
/** Canonical `$schema` URL for the singleton `spec.yaml` style spec. */
export const SPEC_SCHEMA_URL = schemaUrlFor('spec');
