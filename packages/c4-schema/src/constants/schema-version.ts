/**
 * Schema family version tag embedded in every generated JSON Schema `$id`
 * and in the `yaml-language-server` directive written at the top of C4
 * artifact files. Bump this only when the C4 schema family makes a
 * breaking change to the wire shape.
 */
export const SCHEMA_VERSION = 'v1alpha1';

/**
 * Base URL under which every C4 JSON Schema is published. All twelve
 * per-kind schema URLs are this base plus `<name>.schema.json`.
 */
export const SCHEMA_BASE_URL = `https://schema.workspec.io/${SCHEMA_VERSION}/c4/`;

/** JSON Schema meta-schema dialect every generated schema declares conformance to. */
export const JSON_SCHEMA_DIALECT = 'https://json-schema.org/draft/2020-12/schema';
