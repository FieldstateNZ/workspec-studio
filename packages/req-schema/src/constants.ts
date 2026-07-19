// Normative constants for the WorkSpec traceability requirement kinds. These
// are the public, stable identifiers `req-schema`'s four owned kinds
// (Feature, UserRequirement, SystemRequirement, Scenario) publish. The
// version line, `apiVersion`, dialect, and the base URL are all inherited
// from `@workspec/schema-core` (SCHEMA_VERSION / API_VERSION /
// SCHEMA_BASE_URL) — this package only adds the per-kind `$id` URLs and their
// editor directives. Changing any of these is a schema version bump.

import { SCHEMA_BASE_URL, schemaDirective } from '@workspec/schema-core';

/**
 * Canonical `$id` / `$schema` URL for `Feature` artifact files. FLAT under the
 * shared `SCHEMA_BASE_URL` (no per-family path segment) — matching the shared
 * `Actor` kind and issue #69's registry layout, not `@workspec/c4-schema`'s
 * family-scoped `.../v1alpha1/c4/` base.
 */
export const FEATURE_SCHEMA_URL = `${SCHEMA_BASE_URL}feature.schema.json` as const;

/** Canonical `$id` / `$schema` URL for `UserRequirement` artifact files. */
export const USER_REQUIREMENT_SCHEMA_URL =
  `${SCHEMA_BASE_URL}user-requirement.schema.json` as const;

/**
 * Canonical `$id` / `$schema` URL for `SystemRequirement` artifact files. Per
 * spec §4.4, a `SystemRequirement` is now a Gherkin **Rule** — it groups
 * scenarios but carries no steps of its own; those live on `Scenario` (§4.5).
 */
export const SYSTEM_REQUIREMENT_SCHEMA_URL =
  `${SCHEMA_BASE_URL}system-requirement.schema.json` as const;

/**
 * Canonical `$id` / `$schema` URL for `Scenario` artifact files (spec §4.5) —
 * the fifth, file-native kind: the executed unit that carries the Gherkin
 * `given`/`when`/`then` steps and references its parent Rule via
 * `systemRequirement`.
 */
export const SCENARIO_SCHEMA_URL = `${SCHEMA_BASE_URL}scenario.schema.json` as const;

/** Directive header written at the top of every `Feature` artifact file. */
export const FEATURE_SCHEMA_DIRECTIVE = schemaDirective(FEATURE_SCHEMA_URL);

/** Directive header written at the top of every `UserRequirement` artifact file. */
export const USER_REQUIREMENT_SCHEMA_DIRECTIVE = schemaDirective(USER_REQUIREMENT_SCHEMA_URL);

/** Directive header written at the top of every `SystemRequirement` artifact file. */
export const SYSTEM_REQUIREMENT_SCHEMA_DIRECTIVE = schemaDirective(SYSTEM_REQUIREMENT_SCHEMA_URL);

/** Directive header written at the top of every `Scenario` artifact file. */
export const SCENARIO_SCHEMA_DIRECTIVE = schemaDirective(SCENARIO_SCHEMA_URL);
