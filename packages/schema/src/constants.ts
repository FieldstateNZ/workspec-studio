// Normative constants for the WorkSpec Decision Studio artifact schema.
//
// These are the public, stable identifiers other packages (engine, CLI, UI) and
// external tooling (editors, CI) depend on. Changing any of them is a schema
// version bump.

/** Schema version tag embedded in `apiVersion` and the published `$schema` URLs. */
export const SCHEMA_VERSION = 'v1alpha1' as const;

/**
 * Kubernetes-style `apiVersion` discriminant carried by every artifact.
 * `group/version`, where the group is the schema's DNS namespace.
 */
export const API_VERSION = 'workspec.io/v1alpha1' as const;

/** Base URL under which the published JSON Schemas live. Trailing slash included. */
export const SCHEMA_BASE_URL = 'https://schema.workspec.io/v1alpha1/' as const;

/** Canonical `$schema` URL for `*.decision.yaml` files. */
export const DECISION_SCHEMA_URL = `${SCHEMA_BASE_URL}decision.schema.json` as const;

/** Canonical `$schema` URL for `*.catalog.yaml` files. */
export const CATALOG_SCHEMA_URL = `${SCHEMA_BASE_URL}catalog.schema.json` as const;

/** JSON Schema meta-schema all generated schemas declare conformance to. */
export const JSON_SCHEMA_DIALECT = 'https://json-schema.org/draft/2020-12/schema' as const;

/**
 * Build the `yaml-language-server` directive header that binds a YAML file to a
 * JSON Schema in editors (VS Code YAML extension, etc). Returns a single comment
 * line terminated by a newline.
 */
export function schemaDirective(url: string): string {
  return `# yaml-language-server: $schema=${url}\n`;
}

/** Directive header written at the top of every `*.decision.yaml` file. */
export const DECISION_SCHEMA_DIRECTIVE = schemaDirective(DECISION_SCHEMA_URL);

/** Directive header written at the top of every `*.catalog.yaml` file. */
export const CATALOG_SCHEMA_DIRECTIVE = schemaDirective(CATALOG_SCHEMA_URL);

// ── Normative file naming ──────────────────────────────────────────────────
// Decision artifacts and catalog artifacts are discovered purely by filename
// suffix. The repository layer (S3) globs the working tree for these.

/** Filename suffix that marks a decision artifact. */
export const DECISION_FILE_SUFFIX = '.decision.yaml' as const;

/** Filename suffix that marks a catalog artifact. */
export const CATALOG_FILE_SUFFIX = '.catalog.yaml' as const;

/** Bare glob for decision artifacts (single directory). */
export const DECISION_FILE_GLOB = '*.decision.yaml' as const;

/** Bare glob for catalog artifacts (single directory). */
export const CATALOG_FILE_GLOB = '*.catalog.yaml' as const;

/** Recursive glob for decision artifacts (whole working tree). */
export const DECISION_FILE_GLOB_RECURSIVE = '**/*.decision.yaml' as const;

/** Recursive glob for catalog artifacts (whole working tree). */
export const CATALOG_FILE_GLOB_RECURSIVE = '**/*.catalog.yaml' as const;

/** True if `filename` is a decision artifact by the normative naming rule. */
export function isDecisionFile(filename: string): boolean {
  return filename.endsWith(DECISION_FILE_SUFFIX);
}

/** True if `filename` is a catalog artifact by the normative naming rule. */
export function isCatalogFile(filename: string): boolean {
  return filename.endsWith(CATALOG_FILE_SUFFIX);
}
