// Normative constants for the WorkSpec Cost Attribution artifact schemas.
//
// The version line, `apiVersion`, JSON Schema dialect, shared base URL, and
// the `schemaDirective` builder are inherited from `@workspec/schema-core`
// (`SCHEMA_VERSION` / `API_VERSION` / `SCHEMA_BASE_URL` / `JSON_SCHEMA_DIALECT`
// / `schemaDirective`) — this package only adds the four per-kind `$id` URLs
// and their editor directives, mirroring `@workspec/req-schema`'s
// `constants.ts`. The shared constants are re-exported below (values are
// unchanged from cost-schema's own former local copies) so existing
// `@workspec/cost-schema` consumers don't have to switch import sources for
// values that haven't changed.

import { SCHEMA_BASE_URL, schemaDirective } from '@workspec/schema-core';

export {
  SCHEMA_VERSION,
  API_VERSION,
  SCHEMA_BASE_URL,
  JSON_SCHEMA_DIALECT,
  schemaDirective,
} from '@workspec/schema-core';

/** Canonical `$schema` URL for `*.inventory.yaml` files. */
export const INVENTORY_SCHEMA_URL = `${SCHEMA_BASE_URL}inventory.schema.json` as const;

/** Canonical `$schema` URL for `*.spend.yaml` files. */
export const SPEND_SCHEMA_URL = `${SCHEMA_BASE_URL}spend.schema.json` as const;

/** Canonical `$schema` URL for `*.attribution.yaml` files. */
export const ATTRIBUTION_SCHEMA_URL = `${SCHEMA_BASE_URL}attribution.schema.json` as const;

/** Canonical `$schema` URL for `*.tagplan.yaml` files. */
export const TAGPLAN_SCHEMA_URL = `${SCHEMA_BASE_URL}tagplan.schema.json` as const;

/** Directive header written at the top of every `*.inventory.yaml` file. */
export const INVENTORY_SCHEMA_DIRECTIVE = schemaDirective(INVENTORY_SCHEMA_URL);

/** Directive header written at the top of every `*.spend.yaml` file. */
export const SPEND_SCHEMA_DIRECTIVE = schemaDirective(SPEND_SCHEMA_URL);

/** Directive header written at the top of every `*.attribution.yaml` file. */
export const ATTRIBUTION_SCHEMA_DIRECTIVE = schemaDirective(ATTRIBUTION_SCHEMA_URL);

/** Directive header written at the top of every `*.tagplan.yaml` file. */
export const TAGPLAN_SCHEMA_DIRECTIVE = schemaDirective(TAGPLAN_SCHEMA_URL);
