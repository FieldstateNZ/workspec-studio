// Normative constants for the WorkSpec shared schema base. These are the
// public, stable identifiers every `@workspec/*-schema` package that adopts
// `defineArtifact` (and the shared kinds this package publishes, e.g. Actor)
// depends on. Changing any of them is a schema version bump.

/** Schema version tag embedded in `apiVersion` and the published `$schema` URLs. */
export const SCHEMA_VERSION = 'v1alpha1' as const;

/**
 * Kubernetes-style `apiVersion` discriminant carried by every artifact built
 * with `defineArtifact`. `group/version`, where the group is the schema
 * family's DNS namespace. Identical value to `@workspec/cost-schema` and
 * `@workspec/decision-schema`'s own `API_VERSION` — all WorkSpec artifact
 * families share one version line.
 */
export const API_VERSION = 'workspec.io/v1alpha1' as const;

/**
 * Base URL under which the shared kinds' JSON Schemas are published. Flat —
 * no per-family path segment — because these kinds (Actor today) are shared
 * across families, unlike e.g. `@workspec/c4-schema`'s family-scoped
 * `.../v1alpha1/c4/` base.
 */
export const SCHEMA_BASE_URL = 'https://schema.workspec.io/v1alpha1/' as const;

/** Canonical `$schema` URL for `Actor` artifact files. */
export const ACTOR_SCHEMA_URL = `${SCHEMA_BASE_URL}actor.schema.json` as const;

/** JSON Schema meta-schema dialect every generated schema declares conformance to. */
export const JSON_SCHEMA_DIALECT = 'https://json-schema.org/draft/2020-12/schema' as const;

/**
 * Builds the `yaml-language-server` directive comment that binds a YAML file
 * to a JSON Schema for editor completion and hover docs (VS Code YAML
 * extension and compatible tooling). Returns a single line terminated by a
 * newline, meant to be the first line of the file.
 */
export function schemaDirective(url: string): string {
  return `# yaml-language-server: $schema=${url}\n`;
}

/** Directive header written at the top of every `Actor` artifact file. */
export const ACTOR_SCHEMA_DIRECTIVE = schemaDirective(ACTOR_SCHEMA_URL);
