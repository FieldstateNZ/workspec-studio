// Normative constants for the WorkSpec Cost Attribution artifact schemas.
//
// These are the public, stable identifiers other packages (provider, engine,
// UI, CLI) and external tooling (editors, CI) depend on. Changing any of them
// is a schema version bump.

/** Schema version tag embedded in `apiVersion` and the published `$schema` URLs. */
export const SCHEMA_VERSION = 'v1alpha1' as const;

/**
 * Kubernetes-style `apiVersion` discriminant carried by every artifact.
 * `group/version`, where the group is the schema's DNS namespace.
 */
export const API_VERSION = 'workspec.io/v1alpha1' as const;

/** Base URL under which the published JSON Schemas live. Trailing slash included. */
export const SCHEMA_BASE_URL = 'https://schema.workspec.io/v1alpha1/' as const;

/** Canonical `$schema` URL for `*.inventory.yaml` files. */
export const INVENTORY_SCHEMA_URL = `${SCHEMA_BASE_URL}inventory.schema.json` as const;

/** Canonical `$schema` URL for `*.spend.yaml` files. */
export const SPEND_SCHEMA_URL = `${SCHEMA_BASE_URL}spend.schema.json` as const;

/** Canonical `$schema` URL for `*.attribution.yaml` files. */
export const ATTRIBUTION_SCHEMA_URL = `${SCHEMA_BASE_URL}attribution.schema.json` as const;

/** Canonical `$schema` URL for `*.tagplan.yaml` files. */
export const TAGPLAN_SCHEMA_URL = `${SCHEMA_BASE_URL}tagplan.schema.json` as const;

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

/** Directive header written at the top of every `*.inventory.yaml` file. */
export const INVENTORY_SCHEMA_DIRECTIVE = schemaDirective(INVENTORY_SCHEMA_URL);

/** Directive header written at the top of every `*.spend.yaml` file. */
export const SPEND_SCHEMA_DIRECTIVE = schemaDirective(SPEND_SCHEMA_URL);

/** Directive header written at the top of every `*.attribution.yaml` file. */
export const ATTRIBUTION_SCHEMA_DIRECTIVE = schemaDirective(ATTRIBUTION_SCHEMA_URL);

/** Directive header written at the top of every `*.tagplan.yaml` file. */
export const TAGPLAN_SCHEMA_DIRECTIVE = schemaDirective(TAGPLAN_SCHEMA_URL);

// ── Normative file naming ──────────────────────────────────────────────────
// Cost artifacts are discovered purely by filename suffix, same as Decision
// Studio's artifacts — the repository layer (a later slice) globs the working
// tree for these.

/** Filename suffix that marks an inventory artifact. */
export const INVENTORY_FILE_SUFFIX = '.inventory.yaml' as const;

/** Filename suffix that marks a spend artifact. */
export const SPEND_FILE_SUFFIX = '.spend.yaml' as const;

/** Filename suffix that marks an attribution artifact. */
export const ATTRIBUTION_FILE_SUFFIX = '.attribution.yaml' as const;

/** Filename suffix that marks a tag-plan artifact. */
export const TAGPLAN_FILE_SUFFIX = '.tagplan.yaml' as const;

/** Bare glob for inventory artifacts (single directory). */
export const INVENTORY_FILE_GLOB = '*.inventory.yaml' as const;

/** Bare glob for spend artifacts (single directory). */
export const SPEND_FILE_GLOB = '*.spend.yaml' as const;

/** Bare glob for attribution artifacts (single directory). */
export const ATTRIBUTION_FILE_GLOB = '*.attribution.yaml' as const;

/** Bare glob for tag-plan artifacts (single directory). */
export const TAGPLAN_FILE_GLOB = '*.tagplan.yaml' as const;

/** Recursive glob for inventory artifacts (whole working tree). */
export const INVENTORY_FILE_GLOB_RECURSIVE = '**/*.inventory.yaml' as const;

/** Recursive glob for spend artifacts (whole working tree). */
export const SPEND_FILE_GLOB_RECURSIVE = '**/*.spend.yaml' as const;

/** Recursive glob for attribution artifacts (whole working tree). */
export const ATTRIBUTION_FILE_GLOB_RECURSIVE = '**/*.attribution.yaml' as const;

/** Recursive glob for tag-plan artifacts (whole working tree). */
export const TAGPLAN_FILE_GLOB_RECURSIVE = '**/*.tagplan.yaml' as const;

/** True if `filename` is an inventory artifact by the normative naming rule. */
export function isInventoryFile(filename: string): boolean {
  return filename.endsWith(INVENTORY_FILE_SUFFIX);
}

/** True if `filename` is a spend artifact by the normative naming rule. */
export function isSpendFile(filename: string): boolean {
  return filename.endsWith(SPEND_FILE_SUFFIX);
}

/** True if `filename` is an attribution artifact by the normative naming rule. */
export function isAttributionFile(filename: string): boolean {
  return filename.endsWith(ATTRIBUTION_FILE_SUFFIX);
}

/** True if `filename` is a tag-plan artifact by the normative naming rule. */
export function isTagPlanFile(filename: string): boolean {
  return filename.endsWith(TAGPLAN_FILE_SUFFIX);
}
