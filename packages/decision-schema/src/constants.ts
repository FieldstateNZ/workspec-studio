// Normative constants for the WorkSpec Decision Studio artifact schema.
//
// The version line, `apiVersion`, JSON Schema dialect, shared base URL, and
// the `schemaDirective` builder are inherited from `@workspec/schema-core`
// (`SCHEMA_VERSION` / `API_VERSION` / `SCHEMA_BASE_URL` / `JSON_SCHEMA_DIALECT`
// / `schemaDirective`) — this package only adds the two per-kind `$id` URLs
// and their editor directives, mirroring `@workspec/cost-schema`'s and
// `@workspec/req-schema`'s `constants.ts`. The shared constants are
// re-exported below (values are unchanged from decision-schema's former
// local copies) so existing `@workspec/decision-schema` consumers don't have
// to switch import sources for values that haven't changed.

import { SCHEMA_BASE_URL, schemaDirective } from '@workspec/schema-core';

export {
  SCHEMA_VERSION,
  API_VERSION,
  SCHEMA_BASE_URL,
  JSON_SCHEMA_DIALECT,
  schemaDirective,
} from '@workspec/schema-core';

/** Canonical `$schema` URL for `*.decision.yaml` files. */
export const DECISION_SCHEMA_URL = `${SCHEMA_BASE_URL}decision.schema.json` as const;

/** Canonical `$schema` URL for `*.catalog.yaml` files. */
export const CATALOG_SCHEMA_URL = `${SCHEMA_BASE_URL}catalog.schema.json` as const;

/** Directive header written at the top of every `*.decision.yaml` file. */
export const DECISION_SCHEMA_DIRECTIVE = schemaDirective(DECISION_SCHEMA_URL);

/** Directive header written at the top of every `*.catalog.yaml` file. */
export const CATALOG_SCHEMA_DIRECTIVE = schemaDirective(CATALOG_SCHEMA_URL);
