import { z } from 'zod';
import { defineArtifact, Slug } from '@workspec/schema-core';
import { ResourceCostOverride } from './common.js';

// ── Environment kind (`.workspec/environments/<slug>.yaml`) ─────────────────
// An Environment (dev/test/prod, ...) carries naming conventions and a set
// of per-resource patches applied on top of the resource's own authored
// fields. Built on `@workspec/schema-core`'s `defineArtifact`.

/**
 * A deep-merge patch applied to one resource within this environment.
 * Deliberately permissive: an override for a resource slug absent from
 * `.workspec/resources/` under this environment is still schema-valid — that
 * dangling-ref check is a `verify`-time host concern, not a schema error
 * (same convention as `@workspec/decision-schema`'s `catalog`/`supersedes`
 * slug refs).
 */
export const ResourceOverride = z
  .object({
    config: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("Patch merged over the resource's own `spec.config` bag."),
    cost: ResourceCostOverride.optional().describe(
      "Patch merged over the resource's own `spec.cost` fields.",
    ),
  })
  .describe('A deep-merge patch over one resource, scoped to this environment.');

/** Environment-specific naming conventions. */
export const EnvironmentNaming = z
  .object({
    resourceGroupSuffix: z
      .string()
      .min(1)
      .optional()
      .describe('Suffix appended to generated resource-group names in this environment.'),
  })
  .describe('Environment-specific naming conventions.');

/**
 * The Environment body: naming conventions plus per-resource override
 * patches, keyed by resource slug.
 */
export const EnvironmentSpec = z
  .object({
    naming: EnvironmentNaming.optional().describe('Naming conventions for this environment.'),
    overrides: z
      .record(Slug, ResourceOverride)
      .optional()
      .describe(
        'Per-resource deep-merge patches, keyed by resource slug. A key for a resource not ' +
          'present in this environment is schema-valid; resolving it is a `verify`-time concern.',
      ),
  })
  .describe('The environment body: naming conventions and per-resource override patches.');

/** A `.workspec/environments/<slug>.yaml` artifact: one deployment environment (dev/test/prod, ...). */
export const EnvironmentArtifact = defineArtifact('Environment', EnvironmentSpec).describe(
  'A WorkSpec environment artifact: naming conventions and per-resource overrides.',
);

// Inferred TypeScript types (Zod is the single source of truth).
export type ResourceOverride = z.infer<typeof ResourceOverride>;
export type EnvironmentNaming = z.infer<typeof EnvironmentNaming>;
export type EnvironmentSpec = z.infer<typeof EnvironmentSpec>;
export type Environment = z.infer<typeof EnvironmentArtifact>;
