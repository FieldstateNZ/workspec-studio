// @workspec/schema-core — the shared base every WorkSpec Studio schema
// package builds on: the K8s-style artifact envelope (apiVersion/kind/
// metadata/spec), path and slug helpers, shared link primitives, and the
// canonical Actor kind. Non-breaking bootstrap: nothing consumes this
// package yet — c4-schema and friends adopt it in a later slice.

/**
 * This package's own identity. A few consumers import this constant as a
 * smoke test of the wiring, matching the pattern in `@workspec/cost-schema`
 * and `@workspec/decision-schema`.
 */
export const SCHEMA_CORE_PACKAGE = '@workspec/schema-core' as const;

// ── Version, URL, and directive constants ───────────────────────────────────
export {
  SCHEMA_VERSION,
  API_VERSION,
  SCHEMA_BASE_URL,
  ACTOR_SCHEMA_URL,
  JSON_SCHEMA_DIALECT,
  schemaDirective,
  ACTOR_SCHEMA_DIRECTIVE,
} from './constants.js';

// ── Path and slug helpers ────────────────────────────────────────────────────
export { WORKSPEC_DIR } from './paths/workspec-dir.js';
export { FILE_EXTENSION } from './paths/file-extension.js';
export { ARTIFACT_KINDS } from './paths/artifact-kind.js';
export type { ArtifactKind } from './paths/artifact-kind.js';
export { TYPE_DIRECTORIES, typeDirectoryFor } from './paths/type-directories.js';
export { slugify } from './paths/slugify.js';
export { slugFromPath } from './paths/slug-from-path.js';

// ── Shared primitives ────────────────────────────────────────────────────────
export { Slug, SLUG_PATTERN, MAX_SLUG_LENGTH } from './schemas/common/slug.js';
export { linksField } from './schemas/common/links-field.js';
export type { LinksField } from './schemas/common/links-field.js';
export { LinkCardinality, CARDINALITY_VALUES } from './schemas/common/link-cardinality.js';
export { PATH_REF_PATTERN } from './schemas/common/path-ref-pattern.js';
export { MetadataSchema } from './schemas/common/metadata.js';
export type { Metadata } from './schemas/common/metadata.js';

// ── The K8s-style envelope builder ──────────────────────────────────────────
export { defineArtifact } from './schemas/define-artifact.js';

// ── The shared Actor kind ────────────────────────────────────────────────────
export { ActorSpec, ActorArtifact } from './schemas/actor.js';
export type { ActorSpec as ActorSpecType, Actor } from './schemas/actor.js';

// ── JSON Schema generation ──────────────────────────────────────────────────
export { buildJsonSchema } from './json-schema/build-json-schema.js';
export { buildAllJsonSchemas } from './json-schema/build-all-json-schemas.js';
export { serializeJsonSchema } from './json-schema/serialize-json-schema.js';
export { sortJsonKeys } from './json-schema/sort-json-keys.js';
