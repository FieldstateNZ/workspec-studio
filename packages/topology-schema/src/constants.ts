// Normative constants for the WorkSpec Topology Studio artifact schema.
//
// The version line, `apiVersion`, JSON Schema dialect, shared base URL, and
// the `schemaDirective` builder are inherited from `@workspec/schema-core`
// (`SCHEMA_VERSION` / `API_VERSION` / `SCHEMA_BASE_URL` / `JSON_SCHEMA_DIALECT`
// / `schemaDirective`) — this package only adds the per-kind `$id` URLs and
// their editor directives, mirroring `@workspec/decision-schema`'s
// `constants.ts`. The shared constants are re-exported below so consumers
// don't have to switch import sources for values that are shared across
// every WorkSpec artifact family.

import { SCHEMA_BASE_URL, schemaDirective } from '@workspec/schema-core';

export {
  SCHEMA_VERSION,
  API_VERSION,
  SCHEMA_BASE_URL,
  JSON_SCHEMA_DIALECT,
  schemaDirective,
} from '@workspec/schema-core';

/** Canonical `$schema` URL for `.workspec/topologies/<slug>.yaml` files. */
export const TOPOLOGY_SCHEMA_URL = `${SCHEMA_BASE_URL}topology.schema.json` as const;

/** Canonical `$schema` URL for `.workspec/resources/<slug>.yaml` files. */
export const RESOURCE_SCHEMA_URL = `${SCHEMA_BASE_URL}resource.schema.json` as const;

/** Canonical `$schema` URL for `.workspec/environments/<slug>.yaml` files. */
export const ENVIRONMENT_SCHEMA_URL = `${SCHEMA_BASE_URL}environment.schema.json` as const;

/**
 * Canonical `$schema` URL for `.workspec/topologies/.layout/<slug>.yaml`
 * files. Named `topology-layout` (not bare `layout`) because, unlike
 * `@workspec/c4-schema`'s own family-scoped `.../c4/layout.schema.json`,
 * this package's generated schemas are committed flat into the repo-root
 * `json-schema/` directory shared by every schema-core-based family — a
 * bare `layout.schema.json` there would be ambiguous.
 */
export const TOPOLOGY_LAYOUT_SCHEMA_URL = `${SCHEMA_BASE_URL}topology-layout.schema.json` as const;

/** Directive header written at the top of every `.workspec/topologies/<slug>.yaml` file. */
export const TOPOLOGY_SCHEMA_DIRECTIVE = schemaDirective(TOPOLOGY_SCHEMA_URL);

/** Directive header written at the top of every `.workspec/resources/<slug>.yaml` file. */
export const RESOURCE_SCHEMA_DIRECTIVE = schemaDirective(RESOURCE_SCHEMA_URL);

/** Directive header written at the top of every `.workspec/environments/<slug>.yaml` file. */
export const ENVIRONMENT_SCHEMA_DIRECTIVE = schemaDirective(ENVIRONMENT_SCHEMA_URL);

/** Directive header written at the top of every topology `.layout/` file. */
export const TOPOLOGY_LAYOUT_SCHEMA_DIRECTIVE = schemaDirective(TOPOLOGY_LAYOUT_SCHEMA_URL);
