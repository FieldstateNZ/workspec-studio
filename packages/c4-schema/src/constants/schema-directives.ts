import {
  ACTOR_SCHEMA_URL,
  COMPONENT_SCHEMA_URL,
  CONTAINER_SCHEMA_URL,
  DATABASE_SCHEMA_URL,
  DIAGRAM_SCHEMA_URL,
  DOMAIN_SCHEMA_URL,
  EXTERNAL_SYSTEM_SCHEMA_URL,
  FEATURE_SCHEMA_URL,
  LAYOUT_SCHEMA_URL,
  QUEUE_SCHEMA_URL,
  SPEC_SCHEMA_URL,
  SYSTEM_SCHEMA_URL,
} from './schema-urls.js';

/**
 * Builds the `yaml-language-server` directive comment that binds a YAML file
 * to a JSON Schema for editor completion and hover docs (VS Code YAML
 * extension and compatible tooling). Returns a single line terminated by a
 * newline, meant to be the first line of the file.
 */
export function schemaDirective(url: string): string {
  return `# yaml-language-server: $schema=${url}\n`;
}

/** Directive header for `actors/*.yaml` files. */
export const ACTOR_SCHEMA_DIRECTIVE = schemaDirective(ACTOR_SCHEMA_URL);
/** Directive header for the singleton `system/*.yaml` file. */
export const SYSTEM_SCHEMA_DIRECTIVE = schemaDirective(SYSTEM_SCHEMA_URL);
/** Directive header for `external-systems/*.yaml` files. */
export const EXTERNAL_SYSTEM_SCHEMA_DIRECTIVE = schemaDirective(EXTERNAL_SYSTEM_SCHEMA_URL);
/** Directive header for `containers/*.yaml` files. */
export const CONTAINER_SCHEMA_DIRECTIVE = schemaDirective(CONTAINER_SCHEMA_URL);
/** Directive header for `components/*.yaml` files. */
export const COMPONENT_SCHEMA_DIRECTIVE = schemaDirective(COMPONENT_SCHEMA_URL);
/** Directive header for `databases/*.yaml` files. */
export const DATABASE_SCHEMA_DIRECTIVE = schemaDirective(DATABASE_SCHEMA_URL);
/** Directive header for `queues/*.yaml` files. */
export const QUEUE_SCHEMA_DIRECTIVE = schemaDirective(QUEUE_SCHEMA_URL);
/** Directive header for `domains/*.yaml` files. */
export const DOMAIN_SCHEMA_DIRECTIVE = schemaDirective(DOMAIN_SCHEMA_URL);
/** Directive header for `features/*.yaml` files. */
export const FEATURE_SCHEMA_DIRECTIVE = schemaDirective(FEATURE_SCHEMA_URL);
/** Directive header for `diagrams/*.yaml` files. */
export const DIAGRAM_SCHEMA_DIRECTIVE = schemaDirective(DIAGRAM_SCHEMA_URL);
/** Directive header for `diagrams/.layout/*.yaml` files. */
export const LAYOUT_SCHEMA_DIRECTIVE = schemaDirective(LAYOUT_SCHEMA_URL);
/** Directive header for the singleton `spec.yaml` file. */
export const SPEC_SCHEMA_DIRECTIVE = schemaDirective(SPEC_SCHEMA_URL);
